import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateResetToken, hashResetToken, sha256Hex } from "@/lib/server-crypto";
import { sendEmail } from "@/lib/email";
import { validateCSRFRequest } from "@/lib/csrf";
import { getAppBaseUrl } from "@/lib/url";
import { consumeSecurityAttempt } from "@/lib/security-rate-limit";

const RESET_TOKEN_EXPIRY_MINUTES = 15;
const RESET_RATE_WINDOW_MS = 15 * 60 * 1000;
const RESET_RATE_BLOCK_MS = 15 * 60 * 1000;
const RESET_USER_LIMIT = 5;
const RESET_IP_LIMIT = 20;

function resetRequestIpKey(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = forwardedFor || req.headers.get("x-real-ip") || "unknown";
  return `reset-request-ip:${sha256Hex(clientIp)}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate CSRF token
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Throttle both the account and the source address so the reset email
    // cannot be used for spam or inbox flooding.
    const [userRate, ipRate] = await Promise.all([
      consumeSecurityAttempt({
        key: `reset-request:${session.user.id}`,
        limit: RESET_USER_LIMIT,
        windowMs: RESET_RATE_WINDOW_MS,
        blockMs: RESET_RATE_BLOCK_MS,
      }),
      consumeSecurityAttempt({
        key: resetRequestIpKey(req),
        limit: RESET_IP_LIMIT,
        windowMs: RESET_RATE_WINDOW_MS,
        blockMs: RESET_RATE_BLOCK_MS,
      }),
    ]);

    if (!userRate.allowed || !ipRate.allowed) {
      const retryAfter =
        Math.max(userRate.retryAfterSeconds ?? 0, ipRate.retryAfterSeconds ?? 0) ||
        Math.ceil(RESET_RATE_BLOCK_MS / 1000);
      return NextResponse.json(
        { error: "Too many reset requests. Please try again later.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const vault = await prisma.passwordVault.findUnique({
      where: { userId: session.user.id },
      select: { id: true, userId: true, isConfigured: true },
    });

    if (!vault?.isConfigured) {
      return NextResponse.json({ error: "No password vault found" }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true },
    });

    if (!user || !user.email) {
      return NextResponse.json({ error: "No email address on file" }, { status: 400 });
    }

    // Use the email on file (ignore any email supplied in the body)
    const resetToken = generateResetToken();
    const hashedResetToken = hashResetToken(resetToken);
    const resetTokenExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60000);

    await prisma.passwordVault.update({
      where: { id: vault.id },
      data: {
        resetToken: hashedResetToken,
        resetTokenExpires,
      },
    });

    const resetUrl = `${getAppBaseUrl()}/auth/reset-password?token=${resetToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your Vaulty master password",
        html: `
          <h2>Master Password Reset</h2>
          <p>Hello ${user.name || ""},</p>
          <p>You requested a master password reset for your Vaulty password vault.</p>
          <p>
            <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;">
              Reset Master Password
            </a>
          </p>
          <p>This link expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes.</p>
          <p><strong>Important:</strong> Resetting your master password will make your existing encrypted credentials unrecoverable, because they are encrypted with a key derived from your old master password. Only proceed if you no longer have access to your old password.</p>
          <p>If you did not request this reset, you can ignore this email.</p>
        `,
      });
    } catch (emailError) {
      console.error("Error sending reset email:", emailError);
      // Clear the token so the user can retry
      await prisma.passwordVault.update({
        where: { id: vault.id },
        data: { resetToken: null, resetTokenExpires: null },
      });
      return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 });
    }

    // Log audit
    await prisma.passwordAuditLog.create({
      data: {
        vaultId: vault.id,
        action: "RESET_REQUESTED",
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error requesting password reset:", error);
    return NextResponse.json({ error: "Failed to request password reset" }, { status: 500 });
  }
}

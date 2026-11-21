import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySharePassword,
  getShareAuthCookieName,
  createShareAuthToken,
  verifyShareAuthToken,
} from "@/lib/share-crypto";
import { z } from "zod";
import { consumeSecurityAttempt, clearSecurityAttempts } from "@/lib/security-rate-limit";
import { sha256Hex } from "@/lib/server-crypto";

const ATTEMPT_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function shareAttemptKey(token: string, req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = forwardedFor || req.headers.get("x-real-ip") || "unknown";
  return `share-password:${sha256Hex(`${token}:${clientIp}`)}`;
}

function noStoreHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            // Do not disclose storage provider identifiers or owner identity.
            // The file endpoint performs its own authorization checks.
          },
        },
      },
    });

    if (!shareLink || !shareLink.isActive) {
      return NextResponse.json(
        { error: "Share link not found or has been revoked." },
        { status: 404, headers: noStoreHeaders() },
      );
    }
    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired." },
        { status: 410, headers: noStoreHeaders() },
      );
    }
    if (shareLink.maxViews && shareLink.viewCount >= shareLink.maxViews) {
      return NextResponse.json(
        { error: "This share link has reached its maximum number of views." },
        { status: 410, headers: noStoreHeaders() },
      );
    }
    if (shareLink.password) {
      const cookieName = getShareAuthCookieName(shareLink.token);
      const isAuthed = verifyShareAuthToken(shareLink.token, req.cookies.get(cookieName)?.value);
      if (!isAuthed) {
        return NextResponse.json(
          { requiresPassword: true, documentName: shareLink.document.name },
          { status: 401, headers: noStoreHeaders() },
        );
      }
    }

    return NextResponse.json(
      {
        document: shareLink.document,
        shareLink: {
          token: shareLink.token,
          expiresAt: shareLink.expiresAt,
          maxViews: shareLink.maxViews,
          viewCount: shareLink.viewCount,
        },
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    console.error("GET /api/share/[token] error:", error);
    return NextResponse.json(
      { error: "Failed to load shared document." },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const parsed = z
      .object({ password: z.string().min(1).max(256) })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Password is required." },
        { status: 400, headers: noStoreHeaders() },
      );
    const password = parsed.data.password;

    const shareLink = await prisma.shareLink.findUnique({ where: { token } });
    if (!shareLink || !shareLink.isActive) {
      return NextResponse.json(
        { error: "Share link not found or has been revoked." },
        { status: 404, headers: noStoreHeaders() },
      );
    }
    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired." },
        { status: 410, headers: noStoreHeaders() },
      );
    }
    if (!shareLink.password) {
      return NextResponse.json(
        { error: "This share link does not require a password." },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const attemptKey = shareAttemptKey(token, req);
    const rate = await consumeSecurityAttempt({
      key: attemptKey,
      limit: ATTEMPT_LIMIT,
      windowMs: WINDOW_MS,
      blockMs: LOCK_MS,
    });
    if (!rate.allowed) {
      const retryAfter = rate.retryAfterSeconds ?? Math.ceil(LOCK_MS / 1000);
      return NextResponse.json(
        { error: "Too many incorrect attempts. Try again later.", retryAfter },
        { status: 429, headers: { ...noStoreHeaders(), "Retry-After": String(retryAfter) } },
      );
    }

    if (!verifySharePassword(password, shareLink.password)) {
      return NextResponse.json(
        { error: "Incorrect password.", remainingAttempts: rate.remaining },
        { status: 401, headers: noStoreHeaders() },
      );
    }

    await clearSecurityAttempts(attemptKey);

    const cookieName = getShareAuthCookieName(shareLink.token);
    const authToken = createShareAuthToken(shareLink.token);
    const response = NextResponse.json({ success: true }, { headers: noStoreHeaders() });
    response.cookies.set(cookieName, authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/share/${encodeURIComponent(shareLink.token)}`,
      maxAge: 60 * 30,
    });
    return response;
  } catch (error) {
    console.error("POST /api/share/[token] error:", error);
    return NextResponse.json(
      { error: "Failed to verify password." },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}

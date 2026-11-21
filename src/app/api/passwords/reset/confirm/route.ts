import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashMasterPassword, verifyMasterPassword, hashResetToken } from "@/lib/server-crypto";
import { validateMasterPassword } from "@/lib/crypto";
import { validateCSRFRequest } from "@/lib/csrf";
import { CURRENT_PBKDF2_ITERATIONS } from "@/lib/kdf-config";
import { z } from "zod";
import { randomBytes } from "node:crypto";

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

    const parsed = z
      .object({ token: z.string().min(20).max(256), masterPassword: z.string().min(8).max(256) })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { token, masterPassword } = parsed.data;

    // Validate password strength
    const validation = validateMasterPassword(masterPassword);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.errors.join(". ") }, { status: 400 });
    }

    const hashedToken = hashResetToken(token);
    const vault = await prisma.passwordVault.findFirst({
      where: {
        resetToken: hashedToken,
        userId: session.user.id,
        resetTokenExpires: {
          gt: new Date(),
        },
      },
    });

    if (!vault?.isConfigured || !vault.masterPasswordHash || !vault.encryptionSalt) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    // Prevent reusing the current password
    const isSamePassword = await verifyMasterPassword(masterPassword, vault.masterPasswordHash);
    if (isSamePassword) {
      return NextResponse.json(
        { error: "New password must be different from the current one" },
        { status: 400 },
      );
    }

    const [appCredentialCount, bankCredentialCount] = await Promise.all([
      prisma.appCredential.count({ where: { vaultId: vault.id } }),
      prisma.bankCredential.count({ where: { vaultId: vault.id } }),
    ]);
    if (appCredentialCount + bankCredentialCount > 0) {
      return NextResponse.json(
        {
          error:
            "Password reset is blocked because this vault contains client-side encrypted credentials. Resetting only the server password would make those credentials permanently unreadable. If you still know your current master password, use Settings → Master password to re-encrypt the vault. Recovery-key based password reset is not yet supported.",
          code: "ENCRYPTED_DATA_REQUIRES_REKEY",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const masterPasswordHash = await hashMasterPassword(masterPassword);

    await prisma.$transaction(async (tx) => {
      await tx.passwordVault.update({
        where: { id: vault.id },
        data: {
          masterPasswordHash,
          encryptionSalt: randomBytes(16).toString("base64"),
          kdfIterations: CURRENT_PBKDF2_ITERATIONS,
          resetToken: null,
          resetTokenExpires: null,
          failedAttempts: 0,
          lockedUntil: null,
          // The previous KEK is unrecoverable after this reset. Remove every
          // family key wrapped with it and disable outgoing credential shares.
          familyPublicKey: null,
          familyEncryptedPrivateKey: null,
          familyPrivateKeyIv: null,
          familyKeyUpdatedAt: null,
          // Invalidate stale recovery keys and App Lock PIN/wrapped key
          recoveryKeyId: null,
          recoveryKeyHash: null,
          recoveryEncryptedKEK: null,
          recoverySalt: null,
          recoveryIv: null,
          recoveryQuestions: null,
          appLockPinHash: null,
          appLockWrappedKey: null,
        },
      });
      await tx.familyCredentialKey.deleteMany({
        where: { OR: [{ ownerId: vault.userId }, { memberId: vault.userId }] },
      });
      await tx.familyMembership.updateMany({
        where: { ownerId: vault.userId, shareCredentials: true },
        data: { shareCredentials: false },
      });
      await tx.passwordAuditLog.create({
        data: {
          vaultId: vault.id,
          action: "RESET_COMPLETED",
          ipAddress:
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            req.headers.get("x-real-ip") ||
            "unknown",
          userAgent: req.headers.get("user-agent") || "unknown",
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error confirming password reset:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyMasterPassword } from "@/lib/server-crypto";
import { validateCSRFRequest } from "@/lib/csrf";
import {
  CURRENT_PBKDF2_ITERATIONS,
  MAX_FAILED_ATTEMPTS,
  LOCK_DURATION_MINUTES,
} from "@/lib/constants";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

export async function POST(req: NextRequest) {
  try {
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Defense-in-depth on top of the vault lockout: cap PBKDF2 verify attempts.
    const rateLimited = await userRateLimitResponse({
      userId: session.user.id,
      ...RATE_LIMITS.passwordsUnlock,
    });
    if (rateLimited) return rateLimited;

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const { masterPassword } = body;

    if (!masterPassword) {
      return NextResponse.json({ error: "Missing master password" }, { status: 400 });
    }

    // Get user's vault
    const vault = await prisma.passwordVault.findUnique({
      where: { userId: session.user.id },
    });

    if (!vault || !vault.isConfigured || !vault.masterPasswordHash || !vault.encryptionSalt) {
      return NextResponse.json(
        { error: "Your credential vault is not configured yet. Create a master password first." },
        { status: 409 },
      );
    }

    // Track failed attempts locally (starts from persisted value, reset if lockout expired).
    // Defaults keep legacy/incomplete rows safe if the counters are missing.
    let failedAttempts = vault.failedAttempts ?? 0;
    let lockedUntil = vault.lockedUntil ?? null;

    // Check if vault is locked
    if (lockedUntil && lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        {
          error: `Vault is locked due to too many failed attempts. Please try again in ${remainingMinutes} minutes.`,
          locked: true,
          lockedUntil: lockedUntil.toISOString(),
        },
        { status: 423 },
      );
    }

    // If lockout has expired, reset the failed-attempt counter for a fresh start
    if (lockedUntil && lockedUntil <= new Date()) {
      failedAttempts = 0;
      lockedUntil = null;
      await prisma.passwordVault.update({
        where: { id: vault.id },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    // Verify master password using bcrypt
    const isValid = await verifyMasterPassword(masterPassword, vault.masterPasswordHash);

    if (!isValid) {
      // Increment failed attempts
      const newFailedAttempts = failedAttempts + 1;
      await prisma.passwordVault.update({
        where: { id: vault.id },
        data: {
          failedAttempts: { increment: 1 },
          lockedUntil:
            newFailedAttempts >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60000)
              : null,
        },
      });

      // Log failed attempt
      await prisma.passwordAuditLog.create({
        data: {
          vaultId: vault.id,
          action: "UNLOCK_FAILED",
          ipAddress:
            req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
          userAgent: req.headers.get("user-agent") || "unknown",
        },
      });

      const remainingAttempts = MAX_FAILED_ATTEMPTS - newFailedAttempts;
      return NextResponse.json(
        {
          error: `Invalid master password. ${remainingAttempts} attempts remaining.`,
          remainingAttempts,
        },
        { status: 401 },
      );
    }

    // Reset failed attempts on successful unlock
    await prisma.passwordVault.update({
      where: { id: vault.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    // Log successful unlock
    await prisma.passwordAuditLog.create({
      data: {
        vaultId: vault.id,
        action: "UNLOCK_SUCCESS",
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    // Return encryption salt (client will derive key)
    return NextResponse.json(
      {
        success: true,
        encryptionSalt: vault.encryptionSalt,
        kdfIterations: vault.kdfIterations ?? CURRENT_PBKDF2_ITERATIONS,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error unlocking password vault:", error);
    return NextResponse.json({ error: "Failed to unlock password vault" }, { status: 500 });
  }
}

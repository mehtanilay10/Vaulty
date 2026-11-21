import { NextRequest, NextResponse } from "next/server";
import { isBase64, readJsonRecord } from "@/lib/api-validation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashMasterPassword, verifyMasterPassword } from "@/lib/server-crypto";
import { validateMasterPassword } from "@/lib/crypto";
import { validateCSRFRequest } from "@/lib/csrf";
import { CURRENT_PBKDF2_ITERATIONS } from "@/lib/kdf-config";
import { MAX_FAILED_ATTEMPTS, LOCK_DURATION_MINUTES } from "@/lib/constants";
import { Prisma } from "@prisma/client";

interface AppCredentialPayload {
  id: string;
  name: string;
  url: string | null;
  username: string;
  password: string;
  icon: string | null;
  iconColor: string | null;
}

interface BankCredentialPayload {
  id: string;
  name: string;
  username: string;
  netbankPassword: string | null;
  atmPin: string | null;
  upiPin: string | null;
  mobileAppPin: string | null;
  mobileTransactionPin: string | null;
  icon: string | null;
  iconColor: string | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalString(value: unknown): string | null {
  return isNonEmptyString(value) ? value : null;
}

function parseAppCredential(value: unknown): AppCredentialPayload | null {
  if (!value || typeof value !== "object") return null;
  const credential = value as Record<string, unknown>;

  if (
    !isNonEmptyString(credential.id) ||
    !isNonEmptyString(credential.name) ||
    !isNonEmptyString(credential.username) ||
    !isNonEmptyString(credential.password)
  ) {
    return null;
  }

  return {
    id: credential.id,
    name: credential.name,
    url: optionalString(credential.url),
    username: credential.username,
    password: credential.password,
    icon: optionalString(credential.icon),
    iconColor: optionalString(credential.iconColor),
  };
}

function parseBankCredential(value: unknown): BankCredentialPayload | null {
  if (!value || typeof value !== "object") return null;
  const credential = value as Record<string, unknown>;

  if (
    !isNonEmptyString(credential.id) ||
    !isNonEmptyString(credential.name) ||
    !isNonEmptyString(credential.username)
  ) {
    return null;
  }

  return {
    id: credential.id,
    name: credential.name,
    username: credential.username,
    netbankPassword: optionalString(credential.netbankPassword),
    atmPin: optionalString(credential.atmPin),
    upiPin: optionalString(credential.upiPin),
    mobileAppPin: optionalString(credential.mobileAppPin),
    mobileTransactionPin: optionalString(credential.mobileTransactionPin),
    icon: optionalString(credential.icon),
    iconColor: optionalString(credential.iconColor),
  };
}

// POST - Re-encrypt the vault with a new master password.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const currentMasterPassword = body?.currentMasterPassword;
    const newMasterPassword = body?.newMasterPassword;
    const newEncryptionSalt = body?.newEncryptionSalt;

    if (
      !isNonEmptyString(currentMasterPassword) ||
      !isNonEmptyString(newMasterPassword) ||
      !isNonEmptyString(newEncryptionSalt)
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isBase64(newEncryptionSalt)) {
      return NextResponse.json({ error: "Invalid encryption salt" }, { status: 400 });
    }

    if (currentMasterPassword === newMasterPassword) {
      return NextResponse.json(
        { error: "New master password must be different from the current one" },
        { status: 400 },
      );
    }

    const validation = validateMasterPassword(newMasterPassword);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.errors.join(". ") }, { status: 400 });
    }

    if (!Array.isArray(body?.appCredentials) || !Array.isArray(body?.bankCredentials)) {
      return NextResponse.json({ error: "Re-encrypted credentials are required" }, { status: 400 });
    }

    const vault = await prisma.passwordVault.findUnique({
      where: { userId: session.user.id },
    });

    if (!vault || !vault.isConfigured || !vault.masterPasswordHash || !vault.encryptionSalt) {
      return NextResponse.json(
        { error: "Vault not found. Please set up your credential vault first." },
        { status: 404 },
      );
    }

    // Enforce the same lockout as /unlock so this endpoint cannot be used to
    // brute-force the current master password past the failed-attempt limit.
    if (vault.lockedUntil && vault.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((vault.lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        {
          error: `Vault is locked due to too many failed attempts. Please try again in ${remainingMinutes} minutes.`,
          locked: true,
          lockedUntil: vault.lockedUntil.toISOString(),
        },
        { status: 423 },
      );
    }

    if (vault.lockedUntil && vault.lockedUntil <= new Date()) {
      await prisma.passwordVault.update({
        where: { id: vault.id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
      vault.failedAttempts = 0;
      vault.lockedUntil = null;
    }

    const validCurrentPassword = await verifyMasterPassword(
      currentMasterPassword,
      vault.masterPasswordHash,
    );

    if (!validCurrentPassword) {
      const failedAttempts = (vault.failedAttempts ?? 0) + 1;
      await prisma.passwordVault.update({
        where: { id: vault.id },
        data: {
          failedAttempts: { increment: 1 },
          lockedUntil:
            failedAttempts >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60000)
              : null,
        },
      });
      await prisma.passwordAuditLog.create({
        data: {
          vaultId: vault.id,
          action: "MASTER_PASSWORD_CHANGE_FAILED",
          ipAddress:
            req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
          userAgent: req.headers.get("user-agent") || "unknown",
        },
      });
      const remainingAttempts = MAX_FAILED_ATTEMPTS - failedAttempts;
      return NextResponse.json(
        {
          error:
            remainingAttempts > 0
              ? `Current master password is incorrect. ${remainingAttempts} attempts remaining.`
              : "Current master password is incorrect. Vault is now locked.",
          remainingAttempts: Math.max(0, remainingAttempts),
        },
        { status: 401 },
      );
    }

    const appPayload: AppCredentialPayload[] = [];
    for (const item of body.appCredentials) {
      const parsed = parseAppCredential(item);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid app credential payload" }, { status: 400 });
      }
      appPayload.push(parsed);
    }

    const bankPayload: BankCredentialPayload[] = [];
    for (const item of body.bankCredentials) {
      const parsed = parseBankCredential(item);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid bank credential payload" }, { status: 400 });
      }
      bankPayload.push(parsed);
    }

    const [existingApps, existingBanks] = await Promise.all([
      prisma.appCredential.findMany({
        where: { vaultId: vault.id },
        select: { id: true },
      }),
      prisma.bankCredential.findMany({
        where: { vaultId: vault.id },
        select: { id: true },
      }),
    ]);

    const existingAppIds = new Set(existingApps.map((credential) => credential.id));
    const existingBankIds = new Set(existingBanks.map((credential) => credential.id));

    // Every credential must be included so nothing is left encrypted with the
    // old key after the master password changes.
    if (appPayload.length !== existingAppIds.size || bankPayload.length !== existingBankIds.size) {
      return NextResponse.json(
        { error: "Credential list changed. Please refresh and try again." },
        { status: 409 },
      );
    }

    const seenAppIds = new Set<string>();
    for (const credential of appPayload) {
      if (!existingAppIds.has(credential.id) || seenAppIds.has(credential.id)) {
        return NextResponse.json(
          { error: "Credential list changed. Please refresh and try again." },
          { status: 409 },
        );
      }
      seenAppIds.add(credential.id);
    }

    const seenBankIds = new Set<string>();
    for (const credential of bankPayload) {
      if (!existingBankIds.has(credential.id) || seenBankIds.has(credential.id)) {
        return NextResponse.json(
          { error: "Credential list changed. Please refresh and try again." },
          { status: 409 },
        );
      }
      seenBankIds.add(credential.id);
    }

    const masterPasswordHash = await hashMasterPassword(newMasterPassword);
    const ipAddress =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    await prisma.$transaction(
      async (tx) => {
        await tx.passwordVault.update({
          where: { id: vault.id },
          data: {
            masterPasswordHash,
            encryptionSalt: newEncryptionSalt,
            kdfIterations: CURRENT_PBKDF2_ITERATIONS,
            resetToken: null,
            resetTokenExpires: null,
            failedAttempts: 0,
            lockedUntil: null,
            // The KEK changes with the master password, so every family key
            // wrapped with the old KEK must be discarded.
            familyPublicKey: null,
            familyEncryptedPrivateKey: null,
            familyPrivateKeyIv: null,
            familyKeyUpdatedAt: null,
            // The KEK changes with the master password, so any recovery KEK
            // wrapped with the old KEK is no longer valid. Invalidate recovery
            // key setup so it doesn't give a false sense of security or cause
            // data corruption during recovery attempts.
            recoveryKeyId: null,
            recoveryKeyHash: null,
            recoveryEncryptedKEK: null,
            recoverySalt: null,
            recoveryIv: null,
            recoveryQuestions: null,
            // The master key changed, so invalidate any PIN-wrapped key until re-wrapped
            appLockPinHash: null,
            appLockWrappedKey: null,
          },
        });

        await tx.familyCredentialKey.deleteMany({
          where: { OR: [{ ownerId: session.user.id }, { memberId: session.user.id }] },
        });
        // The owner's family private key was encrypted with the previous KEK.
        // Disable credential sharing until keys are explicitly regenerated.
        await tx.familyMembership.updateMany({
          where: { ownerId: session.user.id, shareCredentials: true },
          data: { shareCredentials: false },
        });

        for (const credential of appPayload) {
          await tx.appCredential.update({
            where: { id: credential.id },
            data: {
              name: credential.name,
              url: credential.url,
              username: credential.username,
              password: credential.password,
              icon: credential.icon,
              iconColor: credential.iconColor,
            },
          });
        }

        for (const credential of bankPayload) {
          await tx.bankCredential.update({
            where: { id: credential.id },
            data: {
              name: credential.name,
              username: credential.username,
              netbankPassword: credential.netbankPassword,
              atmPin: credential.atmPin,
              upiPin: credential.upiPin,
              mobileAppPin: credential.mobileAppPin,
              mobileTransactionPin: credential.mobileTransactionPin,
              icon: credential.icon,
              iconColor: credential.iconColor,
            },
          });
        }

        await tx.passwordAuditLog.create({
          data: {
            vaultId: vault.id,
            action: "MASTER_PASSWORD_CHANGED",
            ipAddress,
            userAgent,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error changing master password:", error);
    return NextResponse.json({ error: "Failed to change master password" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashMasterPassword, hashResetToken } from "@/lib/server-crypto";
import { validateMasterPassword } from "@/lib/crypto";
import { validateCSRFRequest } from "@/lib/csrf";
import { verifyRecoveryAnswer } from "@/lib/key-recovery-verify";
import { consumeSecurityAttempt, clearSecurityAttempts } from "@/lib/security-rate-limit";
import { isBase64 } from "@/lib/api-validation";
import { CURRENT_PBKDF2_ITERATIONS } from "@/lib/kdf-config";

const AppCredentialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().nullable().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  icon: z.string().nullable().optional(),
  iconColor: z.string().nullable().optional(),
});

const BankCredentialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  username: z.string().min(1),
  netbankPassword: z.string().nullable().optional(),
  atmPin: z.string().nullable().optional(),
  upiPin: z.string().nullable().optional(),
  mobileAppPin: z.string().nullable().optional(),
  mobileTransactionPin: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  iconColor: z.string().nullable().optional(),
});

const RekeyBodySchema = z
  .object({
    token: z.string().min(20).max(256).optional(),
    recoveryKey: z.string().regex(/^[a-f0-9]{64}$/i),
    answers: z.array(z.string().trim().min(1).max(256)).length(3),
    newMasterPassword: z.string().min(8).max(256),
    newEncryptionSalt: z
      .string()
      .min(16)
      .max(128)
      .refine(isBase64, "Encryption salt must be base64 encoded"),
    appCredentials: z.array(AppCredentialSchema),
    bankCredentials: z.array(BankCredentialSchema),
    newRecoverySetup: z
      .object({
        recoveryKeyId: z.string().uuid(),
        recoveryKeyHash: z.string().min(20).max(512),
        recoveryEncryptedKEK: z.string().min(1).max(40000),
        recoverySalt: z.string().min(16).max(128),
        recoveryIv: z.string().min(16).max(128),
        recoveryKdfIterations: z.number().int().min(100000).max(1000000),
        recoveryQuestions: z.array(
          z.object({
            id: z.string(),
            question: z.string(),
            answerHash: z.string(),
          }),
        ),
      })
      .optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const parsed = RekeyBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid recovery re-key request payload." },
        { status: 400 },
      );
    }

    const {
      token,
      recoveryKey,
      answers,
      newMasterPassword,
      newEncryptionSalt,
      appCredentials,
      bankCredentials,
      newRecoverySetup,
    } = parsed.data;

    // Validate CSRF if session is present
    if (session?.user?.id && !validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    // Determine target vault: either via session or via valid resetToken
    let vault;
    if (session?.user?.id) {
      vault = await prisma.passwordVault.findUnique({
        where: { userId: session.user.id },
      });
    } else if (token) {
      const hashedToken = hashResetToken(token);
      vault = await prisma.passwordVault.findFirst({
        where: {
          resetToken: hashedToken,
          resetTokenExpires: { gt: new Date() },
        },
      });
    }

    if (!vault || !vault.isConfigured || !vault.recoveryKeyHash || !vault.recoveryQuestions) {
      return NextResponse.json(
        { error: "Vault not found or recovery is not configured for this account." },
        { status: 404 },
      );
    }

    // Rate-limit rekey attempts
    const rate = await consumeSecurityAttempt({
      key: `recovery-rekey:${vault.userId}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
      blockMs: 30 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many recovery attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 1800) } },
      );
    }

    // Verify recovery key
    const recoveryKeyValid = await verifyRecoveryAnswer(recoveryKey, vault.recoveryKeyHash);
    if (!recoveryKeyValid) {
      return NextResponse.json({ error: "Invalid recovery key." }, { status: 403 });
    }

    // Verify answers
    let questions: { id: string; question: string; answerHash: string }[];
    try {
      questions = JSON.parse(vault.recoveryQuestions);
    } catch {
      return NextResponse.json({ error: "Corrupted recovery data." }, { status: 500 });
    }

    if (questions.length !== answers.length) {
      return NextResponse.json(
        { error: "Answer count does not match stored questions." },
        { status: 400 },
      );
    }

    for (let i = 0; i < questions.length; i++) {
      const valid = await verifyRecoveryAnswer(answers[i], questions[i].answerHash);
      if (!valid) {
        return NextResponse.json(
          { error: "Incorrect recovery question answers." },
          { status: 403 },
        );
      }
    }

    // Clear security rate limit on successful answers
    await clearSecurityAttempts(`recovery-rekey:${vault.userId}`);

    // Validate new master password strength
    const validation = validateMasterPassword(newMasterPassword);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.errors.join(". ") }, { status: 400 });
    }

    // Validate that all existing credentials are accounted for in the re-key
    const [existingApps, existingBanks] = await Promise.all([
      prisma.appCredential.findMany({ where: { vaultId: vault.id }, select: { id: true } }),
      prisma.bankCredential.findMany({ where: { vaultId: vault.id }, select: { id: true } }),
    ]);

    const existingAppIds = new Set(existingApps.map((a) => a.id));
    const existingBankIds = new Set(existingBanks.map((b) => b.id));

    if (
      appCredentials.length !== existingAppIds.size ||
      bankCredentials.length !== existingBankIds.size
    ) {
      return NextResponse.json(
        {
          error:
            "Credential count mismatch. All existing vault credentials must be re-encrypted to prevent data loss.",
        },
        { status: 409 },
      );
    }

    for (const app of appCredentials) {
      if (!existingAppIds.has(app.id)) {
        return NextResponse.json(
          { error: `Unrecognized app credential ID: ${app.id}` },
          { status: 400 },
        );
      }
    }

    for (const bank of bankCredentials) {
      if (!existingBankIds.has(bank.id)) {
        return NextResponse.json(
          { error: `Unrecognized bank credential ID: ${bank.id}` },
          { status: 400 },
        );
      }
    }

    const masterPasswordHash = await hashMasterPassword(newMasterPassword);

    await prisma.$transaction(async (tx) => {
      // 1. Update app credentials
      for (const app of appCredentials) {
        await tx.appCredential.update({
          where: { id: app.id },
          data: {
            name: app.name,
            url: app.url ?? null,
            username: app.username,
            password: app.password,
            icon: app.icon ?? null,
            iconColor: app.iconColor ?? null,
          },
        });
      }

      // 2. Update bank credentials
      for (const bank of bankCredentials) {
        await tx.bankCredential.update({
          where: { id: bank.id },
          data: {
            name: bank.name,
            username: bank.username,
            netbankPassword: bank.netbankPassword ?? null,
            atmPin: bank.atmPin ?? null,
            upiPin: bank.upiPin ?? null,
            mobileAppPin: bank.mobileAppPin ?? null,
            mobileTransactionPin: bank.mobileTransactionPin ?? null,
            icon: bank.icon ?? null,
            iconColor: bank.iconColor ?? null,
          },
        });
      }

      // 3. Update vault
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
          // If updated recovery setup provided, store it
          ...(newRecoverySetup
            ? {
                recoveryKeyId: newRecoverySetup.recoveryKeyId,
                recoveryKeyHash: newRecoverySetup.recoveryKeyHash,
                recoveryEncryptedKEK: newRecoverySetup.recoveryEncryptedKEK,
                recoverySalt: newRecoverySetup.recoverySalt,
                recoveryIv: newRecoverySetup.recoveryIv,
                recoveryKdfIterations: newRecoverySetup.recoveryKdfIterations,
                recoveryQuestions: JSON.stringify(newRecoverySetup.recoveryQuestions),
              }
            : {}),
          // Invalidate legacy family key wrapping
          familyPublicKey: null,
          familyEncryptedPrivateKey: null,
          familyPrivateKeyIv: null,
          familyKeyUpdatedAt: null,
          // Vault re-keyed with new master key; invalidate previous wrapped key and PIN
          appLockPinHash: null,
          appLockWrappedKey: null,
        },
      });

      // 4. Invalidate family credential keys (they were wrapped with the old key)
      await tx.familyCredentialKey.deleteMany({
        where: { OR: [{ ownerId: vault.userId }, { memberId: vault.userId }] },
      });

      // 5. Audit log
      await tx.passwordAuditLog.create({
        data: {
          vaultId: vault.id,
          action: "VAULT_RECOVERY_REKEY",
          metadata: JSON.stringify({
            appCount: appCredentials.length,
            bankCount: bankCredentials.length,
            refreshedRecovery: Boolean(newRecoverySetup),
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Vault recovered and re-keyed successfully.",
    });
  } catch (error) {
    console.error("POST /api/passwords/recovery/rekey error:", error);
    return NextResponse.json(
      { error: "Failed to recover and re-key credential vault." },
      { status: 500 },
    );
  }
}

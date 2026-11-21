import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyRecoveryAnswer } from "@/lib/key-recovery-verify";
import { validateCSRFRequest } from "@/lib/csrf";
import { consumeSecurityAttempt, clearSecurityAttempts } from "@/lib/security-rate-limit";
import { hashResetToken } from "@/lib/server-crypto";

const BodySchema = z
  .object({
    token: z.string().min(20).max(256).optional(),
    recoveryKey: z.string().regex(/^[a-f0-9]{64}$/i),
    answers: z.array(z.string().trim().min(1).max(256)).length(3),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const token = req.nextUrl.searchParams.get("token") || undefined;

    if (!user && !token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const vault = user
      ? await prisma.passwordVault.findUnique({
          where: { userId: user.id },
          select: {
            id: true,
            isConfigured: true,
            recoveryQuestions: true,
            recoveryKeyHash: true,
            recoveryEncryptedKEK: true,
            appCredentials: { select: { id: true } },
            bankCredentials: { select: { id: true } },
          },
        })
      : await prisma.passwordVault.findFirst({
          where: {
            resetToken: token ? hashResetToken(token) : undefined,
            resetTokenExpires: { gt: new Date() },
          },
          select: {
            id: true,
            isConfigured: true,
            recoveryQuestions: true,
            recoveryKeyHash: true,
            recoveryEncryptedKEK: true,
            appCredentials: { select: { id: true } },
            bankCredentials: { select: { id: true } },
          },
        });

    if (!vault) {
      return NextResponse.json(
        { error: "Vault not found or reset token expired." },
        { status: 404 },
      );
    }

    let questions: { id: string; question: string }[] = [];
    if (vault.recoveryQuestions) {
      try {
        const parsed = JSON.parse(vault.recoveryQuestions);
        if (Array.isArray(parsed)) {
          questions = parsed.map((q: { id: string; question: string }) => ({
            id: q.id,
            question: q.question,
          }));
        }
      } catch {}
    }

    const credentialCount = vault.appCredentials.length + vault.bankCredentials.length;
    const hasRecoverySetup = Boolean(
      vault.recoveryQuestions && vault.recoveryKeyHash && vault.recoveryEncryptedKEK,
    );

    return NextResponse.json(
      {
        isConfigured: vault.isConfigured,
        hasRecoverySetup,
        credentialCount,
        questions,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/passwords/recovery/verify error:", error);
    return NextResponse.json({ error: "Failed to get recovery status." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Valid recovery answers are required." }, { status: 400 });
    }

    if (user && !validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    if (!user && !parsed.data.token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const vault = user
      ? await prisma.passwordVault.findUnique({
          where: { userId: user.id },
          include: { appCredentials: true, bankCredentials: true },
        })
      : await prisma.passwordVault.findFirst({
          where: {
            resetToken: parsed.data.token ? hashResetToken(parsed.data.token) : undefined,
            resetTokenExpires: { gt: new Date() },
          },
          include: { appCredentials: true, bankCredentials: true },
        });

    if (!vault?.recoveryQuestions || !vault.recoveryKeyHash) {
      return NextResponse.json(
        { error: "No recovery setup found for this account." },
        { status: 404 },
      );
    }

    const rate = await consumeSecurityAttempt({
      key: `recovery:${vault.userId}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
      blockMs: 30 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many recovery attempts. Try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSeconds ?? 1800),
            "Cache-Control": "no-store",
          },
        },
      );
    }

    let questions: { id: string; question: string; answerHash: string }[];
    try {
      questions = JSON.parse(vault.recoveryQuestions);
    } catch {
      return NextResponse.json({ error: "Invalid recovery data." }, { status: 500 });
    }
    if (questions.length !== parsed.data.answers.length || questions.length === 0) {
      return NextResponse.json(
        { error: "Answer count does not match recovery questions." },
        { status: 400 },
      );
    }

    const recoveryKeyValid = await verifyRecoveryAnswer(
      parsed.data.recoveryKey,
      vault.recoveryKeyHash,
    );
    let allValid = recoveryKeyValid;
    for (let i = 0; i < questions.length; i++) {
      const valid = await verifyRecoveryAnswer(parsed.data.answers[i], questions[i].answerHash);
      allValid = valid && allValid;
    }
    if (!allValid) {
      return NextResponse.json(
        { error: "Incorrect recovery key or security question answers." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    await clearSecurityAttempts(`recovery:${vault.userId}`);

    if (!vault.recoverySalt || !vault.recoveryIv || !vault.recoveryEncryptedKEK) {
      return NextResponse.json(
        {
          error:
            "Recovery key metadata is incomplete. Please regenerate your recovery key while your vault is unlocked.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        recoveryEncryptedKEK: vault.recoveryEncryptedKEK,
        recoverySalt: vault.recoverySalt,
        recoveryIv: vault.recoveryIv,
        recoveryKdfIterations: vault.recoveryKdfIterations,
        appCredentials: vault.appCredentials,
        bankCredentials: vault.bankCredentials,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "POST /api/passwords/recovery/verify failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ error: "Failed to verify recovery." }, { status: 500 });
  }
}

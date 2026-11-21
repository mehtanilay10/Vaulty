import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { CURRENT_PBKDF2_ITERATIONS, MAX_PBKDF2_ITERATIONS } from "@/lib/constants";
import { z } from "zod";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const parsed = z
      .object({
        recoveryKeyId: z.string().uuid(),
        recoveryKeyHash: z.string().min(20).max(512),
        recoveryEncryptedKEK: z.string().min(1).max(40000),
        recoverySalt: z.string().min(16).max(128),
        recoveryIv: z.string().min(16).max(128),
        recoveryKdfIterations: z
          .number()
          .int()
          .min(CURRENT_PBKDF2_ITERATIONS)
          .max(MAX_PBKDF2_ITERATIONS),
        recoveryQuestions: z
          .array(
            z
              .object({
                id: z.string().min(1).max(256),
                question: z.string().min(1).max(256),
                answerHash: z.string().min(20).max(512),
              })
              .strict(),
          )
          .length(3),
      })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing recovery fields." }, { status: 400 });
    }

    const vault = await prisma.passwordVault.findUnique({
      where: { userId: user.id },
    });

    if (!vault?.isConfigured || !vault.masterPasswordHash || !vault.encryptionSalt) {
      return NextResponse.json({ error: "Vault not found." }, { status: 404 });
    }

    const {
      recoveryKeyId,
      recoveryKeyHash,
      recoveryEncryptedKEK,
      recoverySalt,
      recoveryIv,
      recoveryKdfIterations,
      recoveryQuestions,
    } = parsed.data;
    const questionsJson = JSON.stringify(recoveryQuestions);

    await prisma.passwordVault.update({
      where: { id: vault.id },
      data: {
        recoveryKeyId,
        recoveryKeyHash,
        recoveryEncryptedKEK,
        recoverySalt,
        recoveryIv,
        recoveryKdfIterations,
        recoveryQuestions: questionsJson,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/passwords/recovery/setup error:", error);
    return NextResponse.json({ error: "Failed to set up recovery." }, { status: 500 });
  }
}

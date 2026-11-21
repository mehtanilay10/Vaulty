import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashMasterPassword } from "@/lib/server-crypto";
import { validateCSRFRequest } from "@/lib/csrf";
import { isBase64 } from "@/lib/api-validation";
import { z } from "zod";
import { CURRENT_PBKDF2_ITERATIONS } from "@/lib/kdf-config";

class VaultAlreadyConfiguredError extends Error {
  constructor() {
    super("Vault has already been configured.");
    this.name = "VaultAlreadyConfiguredError";
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Validate CSRF token
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const parsed = z
      .object({
        masterPassword: z.string().min(8).max(256),
        encryptionSalt: z
          .string()
          .min(16)
          .max(128)
          .refine(isBase64, "Encryption salt must be base64 encoded"),
      })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { masterPassword, encryptionSalt } = parsed.data;
    const masterPasswordHash = await hashMasterPassword(masterPassword);

    let vaultId: string;
    try {
      vaultId = await prisma.$transaction(async (tx) => {
        // New accounts already have an empty PasswordVault row created by the
        // Auth.js createUser event. Initialize it exactly once. Legacy accounts
        // without a row are supported through the create branch.
        const existingVault = await tx.passwordVault.findUnique({
          where: { userId },
          select: { id: true, isConfigured: true },
        });
        if (existingVault?.isConfigured) {
          throw new VaultAlreadyConfiguredError();
        }

        let id: string;
        if (existingVault) {
          // Conditional update prevents two concurrent setup requests from
          // silently replacing the first master password.
          const initialized = await tx.passwordVault.updateMany({
            where: { id: existingVault.id, isConfigured: false },
            data: {
              masterPasswordHash,
              encryptionSalt,
              kdfIterations: CURRENT_PBKDF2_ITERATIONS,
              isConfigured: true,
            },
          });
          if (initialized.count !== 1) {
            throw new VaultAlreadyConfiguredError();
          }
          id = existingVault.id;
        } else {
          // The unique constraint on userId is the final guard against a
          // concurrent legacy-account setup creating a duplicate row.
          const createdVault = await tx.passwordVault.create({
            data: {
              userId,
              masterPasswordHash,
              encryptionSalt,
              kdfIterations: CURRENT_PBKDF2_ITERATIONS,
              isConfigured: true,
            },
          });
          id = createdVault.id;
        }

        await tx.passwordAuditLog.create({
          data: {
            vaultId: id,
            action: "VAULT_CREATED",
            ipAddress:
              req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
            userAgent: req.headers.get("user-agent") || "unknown",
          },
        });

        return id;
      });
    } catch (error) {
      if (error instanceof VaultAlreadyConfiguredError || isUniqueConstraintError(error)) {
        return NextResponse.json({ error: "Vault has already been configured" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, vaultId });
  } catch (error) {
    console.error("Error setting up password vault:", error);
    return NextResponse.json({ error: "Failed to setup password vault" }, { status: 500 });
  }
}

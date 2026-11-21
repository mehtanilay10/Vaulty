import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { apiError, apiSuccess } from "@/lib/api-response";
import { extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { hasFamilyModuleAccess } from "@/lib/family-access";

const Schema = z
  .object({
    credentialId: z.string().min(1).max(128),
    type: z.enum(["APP", "BANK"]),
    action: z.enum(["VIEW", "COPY", "FAMILY_VIEW", "FAMILY_COPY"]),
  })
  .strict();

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!validateCSRFRequest(req)) return apiError("Invalid CSRF token", 403);

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid credential audit request.", 400);

  const credential =
    parsed.data.type === "APP"
      ? await prisma.appCredential.findUnique({
          where: { id: parsed.data.credentialId },
          select: {
            id: true,
            vaultId: true,
            vault: { select: { id: true, userId: true, isConfigured: true } },
          },
        })
      : await prisma.bankCredential.findUnique({
          where: { id: parsed.data.credentialId },
          select: {
            id: true,
            vaultId: true,
            vault: { select: { id: true, userId: true, isConfigured: true } },
          },
        });

  if (!credential || !credential.vault?.isConfigured) {
    return apiError("Credential not found.", 404);
  }

  const isOwner = credential.vault.userId === user.id;
  const isFamilyAction =
    parsed.data.action === "FAMILY_VIEW" || parsed.data.action === "FAMILY_COPY";

  if (!isOwner) {
    const hasAccess = await hasFamilyModuleAccess(user.id, credential.vault.userId, "credentials");
    if (!hasAccess) {
      return apiError("Forbidden: You do not have access to this credential.", 403);
    }
  }

  const lastAccessedAt = new Date();

  if (parsed.data.type === "APP") {
    await prisma.appCredential.update({
      where: { id: credential.id },
      data: { lastAccessedAt },
    });
  } else {
    await prisma.bankCredential.update({
      where: { id: credential.id },
      data: { lastAccessedAt },
    });
  }

  const auditAction =
    !isOwner || isFamilyAction
      ? parsed.data.action === "COPY" || parsed.data.action === "FAMILY_COPY"
        ? "FAMILY_COPY"
        : "FAMILY_VIEW"
      : parsed.data.action === "COPY"
        ? "CREDENTIAL_COPIED"
        : "CREDENTIAL_VIEWED";

  const metadata = !isOwner
    ? JSON.stringify({
        accessedByUserId: user.id,
        accessedByEmail: user.email,
        accessedByName: user.name,
      })
    : null;

  await prisma.passwordAuditLog.create({
    data: {
      vaultId: credential.vaultId,
      action: auditAction,
      credentialType: parsed.data.type,
      credentialId: credential.id,
      metadata,
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
    },
  });

  return apiSuccess({ success: true, lastAccessedAt: lastAccessedAt.toISOString() });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      page: z.coerce.number().int().min(1).max(100).default(1),
    })
    .safeParse({
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      page: req.nextUrl.searchParams.get("page") ?? undefined,
    });
  if (!parsed.success) return apiError("Invalid pagination parameters.", 400);

  const vault = await prisma.passwordVault.findUnique({
    where: { userId: user.id },
    select: { id: true, isConfigured: true },
  });
  const take = parsed.data.limit * parsed.data.page + 1;
  const [accountEvents, credentialEvents, accountCount, credentialCount] = await Promise.all([
    prisma.auditLog.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    }),
    vault?.isConfigured
      ? prisma.passwordAuditLog.findMany({
          where: { vaultId: vault.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take,
        })
      : Promise.resolve([]),
    prisma.auditLog.count({ where: { userId: user.id } }),
    vault?.isConfigured
      ? prisma.passwordAuditLog.count({ where: { vaultId: vault.id } })
      : Promise.resolve(0),
  ]);

  const combined = [
    ...accountEvents.map((event) => ({
      id: event.id,
      action: event.action,
      createdAt: event.createdAt,
      source: "ACCOUNT" as const,
      metadata: event.metadata,
    })),
    ...credentialEvents.map((event) => ({
      id: event.id,
      action: event.action,
      createdAt: event.createdAt,
      source: "CREDENTIALS" as const,
      metadata: event.metadata,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

  const start = (parsed.data.page - 1) * parsed.data.limit;
  const events = combined.slice(start, start + parsed.data.limit);
  const total = accountCount + credentialCount;
  return apiSuccess({
    events,
    pagination: {
      page: parsed.data.page,
      pageSize: parsed.data.limit,
      total,
      hasMore: start + events.length < total,
    },
  });
}

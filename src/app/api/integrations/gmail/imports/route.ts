import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { z } from "zod";

const getImportsQuerySchema = z.object({
  status: z.enum(["PENDING", "IMPORTED", "DISMISSED"]).default("PENDING"),
});

const patchImportSchema = z.object({
  candidateId: z.string().optional(),
  candidateIds: z.array(z.string()).optional(),
  accountId: z.string().min(1).nullable().optional(),
  status: z.enum(["PENDING", "IMPORTED", "DISMISSED"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rawStatus = req.nextUrl.searchParams.get("status") || "PENDING";
    const parseResult = getImportsQuerySchema.safeParse({ status: rawStatus });
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid import status." }, { status: 400 });
    }
    const { status } = parseResult.data;

    const imports = await prisma.emailTransactionImport.findMany({
      where: { ownerId: user.id, status },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return NextResponse.json(
      { imports },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("GET /api/integrations/gmail/imports error:", error);
    return NextResponse.json({ error: "Failed to fetch transaction imports." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });

    const rawBody = await req.json().catch(() => null);
    const parsed = patchImportSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "A transaction candidate is required." },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (body.status === "DISMISSED") {
      const ids =
        body.candidateIds && body.candidateIds.length > 0
          ? body.candidateIds
          : body.candidateId
            ? [body.candidateId]
            : [];

      if (ids.length === 0) {
        return NextResponse.json(
          { error: "No transaction candidates specified." },
          { status: 400 },
        );
      }

      const result = await prisma.emailTransactionImport.updateMany({
        where: { id: { in: ids }, ownerId: user.id, status: "PENDING" },
        data: { status: "DISMISSED" },
      });
      return NextResponse.json({ success: true, count: result.count });
    }

    if (!body.candidateId) {
      return NextResponse.json(
        { error: "A transaction candidate ID is required." },
        { status: 400 },
      );
    }

    const candidate = await prisma.emailTransactionImport.findFirst({
      where: { id: body.candidateId, ownerId: user.id, status: "PENDING" },
      select: { id: true },
    });
    if (!candidate)
      return NextResponse.json({ error: "Pending transaction was not found." }, { status: 404 });

    if (body.accountId) {
      const account = await prisma.wealthAccount.findFirst({
        where: { id: body.accountId, ownerId: user.id, status: "ACTIVE" },
        select: { id: true },
      });
      if (!account)
        return NextResponse.json({ error: "Selected account was not found." }, { status: 404 });
    }

    await prisma.emailTransactionImport.update({
      where: { id: candidate.id },
      data: { accountId: body.accountId ?? null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/integrations/gmail/imports error:", error);
    return NextResponse.json({ error: "Failed to update transaction import." }, { status: 500 });
  }
}

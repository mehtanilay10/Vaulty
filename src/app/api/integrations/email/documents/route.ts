import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { clubDocuments } from "@/lib/sync/dedupe-email-items";
import { z } from "zod";

const getDocumentsQuerySchema = z.object({
  status: z.enum(["PENDING", "IMPORTED", "DISMISSED"]).default("PENDING"),
});

const patchDocumentSchema = z.object({
  id: z.string().min(1, "A document candidate ID is required."),
  documentTitle: z.string().min(1).max(240).optional(),
  documentType: z.string().min(1).max(80).optional(),
  status: z.enum(["PENDING", "IMPORTED", "DISMISSED"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rawStatus = req.nextUrl.searchParams.get("status") || "PENDING";
    const parseResult = getDocumentsQuerySchema.safeParse({ status: rawStatus });
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid document status." }, { status: 400 });
    }
    const { status } = parseResult.data;

    const documents = await prisma.emailDocumentImport.findMany({
      where: { ownerId: user.id, status },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    const clubbedDocuments = clubDocuments(documents);

    return NextResponse.json(
      { documents: clubbedDocuments },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("GET /api/integrations/email/documents error:", error);
    return NextResponse.json({ error: "Failed to fetch document imports." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = patchDocumentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload." },
        { status: 400 },
      );
    }
    const { id, documentTitle, documentType, status } = parsed.data;

    const existing = await prisma.emailDocumentImport.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!existing || existing.ownerId !== user.id) {
      return NextResponse.json({ error: "Document candidate not found." }, { status: 404 });
    }

    const updated = await prisma.emailDocumentImport.update({
      where: { id },
      data: {
        ...(documentTitle ? { documentTitle } : {}),
        ...(documentType ? { documentType } : {}),
        ...(status ? { status } : {}),
      },
    });

    return NextResponse.json({ success: true, document: updated });
  } catch (error) {
    console.error("PATCH /api/integrations/email/documents error:", error);
    return NextResponse.json({ error: "Failed to update document." }, { status: 500 });
  }
}

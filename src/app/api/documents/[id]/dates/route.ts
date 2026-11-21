import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { checkDocumentAccess } from "@/lib/authz";
import { validateCSRFRequest } from "@/lib/csrf";

const dateSchema = z
  .object({
    type: z.string().min(1).max(80),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    confidence: z.number().min(0).max(1).optional(),
    evidence: z.string().max(500).nullable().optional(),
  })
  .strict();

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validateCSRFRequest(req))
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  const { id } = await params;
  const access = await checkDocumentAccess(user.id, id);
  if (!access.isOwner)
    return NextResponse.json(
      { error: "Only the document owner can review extracted dates." },
      { status: 403 },
    );
  const body = await req.json().catch(() => null);
  const parsed = z
    .object({
      expiryDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      importantDates: z.array(dateSchema).max(30),
    })
    .strict()
    .safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid extracted date values." }, { status: 400 });

  const document = await prisma.document.findFirst({
    where: { id, ownerId: user.id },
    include: {
      aiProcessing: {
        select: {
          id: true,
          extractedMetadata: true,
        },
      },
    },
  });
  if (!document?.aiProcessing)
    return NextResponse.json({ error: "AI document metadata is not available." }, { status: 404 });

  const isValidDate = (value: string) => {
    const date = new Date(`${value}T12:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (parsed.data.expiryDate && !isValidDate(parsed.data.expiryDate)) {
    return NextResponse.json(
      { error: "Expiry date is not a valid calendar date." },
      { status: 400 },
    );
  }
  if (parsed.data.importantDates.some((item) => item.date && !isValidDate(item.date))) {
    return NextResponse.json(
      { error: "One or more important dates are invalid." },
      { status: 400 },
    );
  }

  const metadata = (document.aiProcessing.extractedMetadata || {}) as Record<string, unknown>;
  const normalizedDates = parsed.data.importantDates.map((item) => ({
    type: item.type.trim(),
    date: item.date,
    confidence: 1,
    evidence: "Manually reviewed by the user.",
    reviewed: true,
  }));
  const expiryDate =
    parsed.data.expiryDate === undefined
      ? typeof metadata.expiryDate === "string"
        ? metadata.expiryDate
        : null
      : parsed.data.expiryDate;
  const nextMetadata = {
    ...metadata,
    expiryDate,
    expiryDateConfidence: parsed.data.expiryDate !== undefined ? 1 : metadata.expiryDateConfidence,
    expiryDateEvidence:
      parsed.data.expiryDate !== undefined
        ? "Manually reviewed by the user."
        : metadata.expiryDateEvidence,
    importantDates: normalizedDates,
  };

  await prisma.$transaction(async (tx) => {
    await tx.aiProcessing.update({
      where: { documentId: id },
      data: { extractedMetadata: nextMetadata as Prisma.InputJsonValue },
    });
    if (parsed.data.expiryDate !== undefined) {
      await tx.document.update({
        where: { id },
        data: {
          expiryDate: parsed.data.expiryDate
            ? new Date(`${parsed.data.expiryDate}T12:00:00.000Z`)
            : null,
        },
      });
    }
    await tx.reminder.updateMany({
      where: {
        userId: user.id,
        description: { contains: `Extracted from ${document.name}` },
      },
      data: { isActive: false },
    });
    for (const item of normalizedDates) {
      const title = `${item.type.slice(0, 70)} · ${document.name.slice(0, 100)}`;
      const existing = await tx.reminder.findFirst({
        where: {
          userId: user.id,
          title,
          description: { contains: `Extracted from ${document.name}` },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!item.date) {
        if (existing)
          await tx.reminder.update({ where: { id: existing.id }, data: { isActive: false } });
        continue;
      }
      const dueAt = new Date(`${item.date}T12:00:00.000Z`);
      const type = item.type.toLowerCase();
      const category: "INSURANCE" | "SUBSCRIPTION" | "PAYMENT" | "DOCUMENT" =
        type.includes("insurance") || type.includes("premium") || type.includes("policy")
          ? "INSURANCE"
          : type.includes("subscription")
            ? "SUBSCRIPTION"
            : type.includes("payment") || type.includes("due")
              ? "PAYMENT"
              : "DOCUMENT";
      const reminderData = {
        title,
        category,
        dueAt,
        isActive: true,
        description:
          `Extracted from ${document.name}. User reviewed this date. Evidence: ${item.evidence || "No supporting excerpt."}`.slice(
            0,
            2000,
          ),
        notifyDaysBefore: [7, 1, 0],
      };
      if (existing) await tx.reminder.update({ where: { id: existing.id }, data: reminderData });
      else await tx.reminder.create({ data: { userId: user.id, ...reminderData } });
    }
  });
  return NextResponse.json({ success: true, metadata: nextMetadata });
}

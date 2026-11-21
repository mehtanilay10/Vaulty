import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { clubReminders } from "@/lib/sync/dedupe-email-items";
import { z } from "zod";

const getRemindersQuerySchema = z.object({
  status: z.enum(["PENDING", "IMPORTED", "DISMISSED"]).default("PENDING"),
});

const patchReminderSchema = z.object({
  id: z.string().min(1, "A reminder candidate ID is required."),
  title: z.string().min(1).max(240).optional(),
  category: z.enum(["PAYMENT", "SUBSCRIPTION", "INSURANCE", "DOCUMENT", "PERSONAL"]).optional(),
  dueAt: z.string().optional(),
  status: z.enum(["PENDING", "IMPORTED", "DISMISSED"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rawStatus = req.nextUrl.searchParams.get("status") || "PENDING";
    const parseResult = getRemindersQuerySchema.safeParse({ status: rawStatus });
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid reminder status." }, { status: 400 });
    }
    const { status } = parseResult.data;

    const reminders = await prisma.emailReminderImport.findMany({
      where: { ownerId: user.id, status },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    const clubbedReminders = clubReminders(reminders);

    return NextResponse.json(
      { reminders: clubbedReminders },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("GET /api/integrations/email/reminders error:", error);
    return NextResponse.json({ error: "Failed to fetch reminder imports." }, { status: 500 });
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
    const parsed = patchReminderSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload." },
        { status: 400 },
      );
    }
    const { id, title, category, dueAt, status } = parsed.data;

    const existing = await prisma.emailReminderImport.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!existing || existing.ownerId !== user.id) {
      return NextResponse.json({ error: "Reminder candidate not found." }, { status: 404 });
    }

    const updated = await prisma.emailReminderImport.update({
      where: { id },
      data: {
        ...(title ? { title } : {}),
        ...(category ? { category } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt) } : {}),
        ...(status ? { status } : {}),
      },
    });

    return NextResponse.json({ success: true, reminder: updated });
  } catch (error) {
    console.error("PATCH /api/integrations/email/reminders error:", error);
    return NextResponse.json({ error: "Failed to update reminder." }, { status: 500 });
  }
}

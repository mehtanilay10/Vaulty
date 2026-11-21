import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";

const categories = ["DOCUMENT", "PAYMENT", "INSURANCE", "SUBSCRIPTION", "PERSONAL"] as const;
type ReminderCategory = (typeof categories)[number];
const recurrences = ["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
type ReminderRecurrence = (typeof recurrences)[number];
const reminderInput = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional().nullable(),
    category: z.enum(categories).default("PERSONAL"),
    dueAt: z.string().datetime(),
    recurrence: z.enum(recurrences).default("NONE"),
    notifyDaysBefore: z.array(z.number().int().min(0).max(365)).min(1).max(8).default([7, 1, 0]),
    notifyInApp: z.boolean().default(true),
    notifyByEmail: z.boolean().default(true),
  })
  .refine((value) => value.notifyInApp || value.notifyByEmail, {
    message: "Choose at least one notification channel.",
  });

function nextOccurrence(current: Date, recurrence: string) {
  const next = new Date(current);
  if (recurrence === "DAILY") next.setDate(next.getDate() + 1);
  if (recurrence === "WEEKLY") next.setDate(next.getDate() + 7);
  if (recurrence === "MONTHLY") {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  if (recurrence === "YEARLY") {
    const month = next.getMonth();
    const day = next.getDate();
    next.setDate(1);
    next.setFullYear(next.getFullYear() + 1);
    next.setMonth(month);
    const lastDay = new Date(next.getFullYear(), month + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return next;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [reminders, preferences] = await Promise.all([
      prisma.reminder.findMany({
        where: { userId: user.id, isActive: true },
        orderBy: [{ isCompleted: "asc" }, { dueAt: "asc" }],
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { reminderEmailsEnabled: true, reminderInAppEnabled: true },
      }),
    ]);
    return NextResponse.json(
      { reminders, preferences },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("GET /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to fetch reminders." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    const parsed = reminderInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ error: "Please check the reminder details." }, { status: 400 });
    const data = parsed.data;
    const reminder = await prisma.reminder.create({
      data: {
        ...data,
        description: data.description || null,
        notifyDaysBefore: [...new Set(data.notifyDaysBefore)].sort((a, b) => b - a),
        dueAt: new Date(data.dueAt),
        userId: user.id,
      },
    });
    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to create reminder." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    const body = (await req.json().catch(() => null)) as {
      id?: unknown;
      completed?: unknown;
      preferences?: { email?: unknown; inApp?: unknown };
      title?: unknown;
      description?: unknown;
      category?: unknown;
      dueAt?: unknown;
      recurrence?: unknown;
      notifyDaysBefore?: unknown;
      notifyInApp?: unknown;
      notifyByEmail?: unknown;
    } | null;
    if (
      body?.preferences &&
      typeof body.preferences.email === "boolean" &&
      typeof body.preferences.inApp === "boolean"
    ) {
      const preferences = await prisma.user.update({
        where: { id: user.id },
        data: {
          reminderEmailsEnabled: body.preferences.email,
          reminderInAppEnabled: body.preferences.inApp,
        },
        select: { reminderEmailsEnabled: true, reminderInAppEnabled: true },
      });
      return NextResponse.json({ preferences });
    }
    if (!body || typeof body.id !== "string")
      return NextResponse.json({ error: "Invalid reminder update." }, { status: 400 });
    const reminder = await prisma.reminder.findFirst({
      where: { id: body.id, userId: user.id, isActive: true },
    });
    if (!reminder) return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
    if (typeof body.completed === "boolean") {
      let nextDueAt = reminder.dueAt;
      let isCompleted = body.completed;
      if (body.completed && reminder.recurrence !== "NONE") {
        nextDueAt = nextOccurrence(reminder.dueAt, reminder.recurrence);
        while (nextDueAt <= new Date()) nextDueAt = nextOccurrence(nextDueAt, reminder.recurrence);
        isCompleted = false;
      }
      const updated = await prisma.reminder.update({
        where: { id: reminder.id },
        data: { isCompleted, dueAt: nextDueAt },
      });
      return NextResponse.json({ reminder: updated });
    }
    const editData: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (
        typeof body.title !== "string" ||
        body.title.trim().length === 0 ||
        body.title.length > 120
      )
        return NextResponse.json({ error: "Invalid title." }, { status: 400 });
      editData.title = body.title.trim();
    }
    if (body.description !== undefined) {
      if (
        body.description !== null &&
        (typeof body.description !== "string" || body.description.length > 2000)
      )
        return NextResponse.json({ error: "Invalid description." }, { status: 400 });
      editData.description = body.description ? body.description.trim() : null;
    }
    if (body.category !== undefined) {
      if (!categories.includes(body.category as (typeof categories)[number]))
        return NextResponse.json({ error: "Invalid category." }, { status: 400 });
      editData.category = body.category as ReminderCategory;
    }
    if (body.dueAt !== undefined) {
      if (
        typeof body.dueAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(body.dueAt)
      )
        return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
      editData.dueAt = new Date(body.dueAt);
    }
    if (body.recurrence !== undefined) {
      if (!recurrences.includes(body.recurrence as (typeof recurrences)[number]))
        return NextResponse.json({ error: "Invalid recurrence." }, { status: 400 });
      editData.recurrence = body.recurrence as ReminderRecurrence;
    }
    if (body.notifyDaysBefore !== undefined) {
      if (
        !Array.isArray(body.notifyDaysBefore) ||
        body.notifyDaysBefore.length < 1 ||
        body.notifyDaysBefore.length > 8
      )
        return NextResponse.json({ error: "Invalid notification days." }, { status: 400 });
      const validDays = body.notifyDaysBefore.every(
        (d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 365,
      );
      if (!validDays)
        return NextResponse.json({ error: "Invalid notification days." }, { status: 400 });
      editData.notifyDaysBefore = [...new Set(body.notifyDaysBefore)].sort((a, b) => b - a);
    }
    if (body.notifyInApp !== undefined) {
      if (typeof body.notifyInApp !== "boolean")
        return NextResponse.json(
          { error: "Invalid in-app notification setting." },
          { status: 400 },
        );
      editData.notifyInApp = body.notifyInApp;
    }
    if (body.notifyByEmail !== undefined) {
      if (typeof body.notifyByEmail !== "boolean")
        return NextResponse.json({ error: "Invalid email notification setting." }, { status: 400 });
      editData.notifyByEmail = body.notifyByEmail;
    }
    if (Object.keys(editData).length === 0)
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    if (editData.notifyInApp !== undefined && editData.notifyByEmail !== undefined) {
      if (!editData.notifyInApp && !editData.notifyByEmail)
        return NextResponse.json(
          { error: "Choose at least one notification channel." },
          { status: 400 },
        );
    }
    const updated = await prisma.reminder.update({
      where: { id: reminder.id },
      data: editData,
    });
    return NextResponse.json({ reminder: updated });
  } catch (error) {
    console.error("PATCH /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to update reminder." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Reminder ID is required." }, { status: 400 });
    await prisma.reminder.updateMany({ where: { id, userId: user.id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/reminders error:", error);
    return NextResponse.json({ error: "Failed to delete reminder." }, { status: 500 });
  }
}

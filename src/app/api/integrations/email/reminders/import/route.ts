import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { validateCSRFRequest } from "@/lib/csrf";
import { z } from "zod";

const importSchema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = importSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const { id, ids, all } = parsed.data;

    const filter = all ? {} : ids && ids.length > 0 ? { id: { in: ids } } : { id: id ? id : "" };

    const candidates = await prisma.emailReminderImport.findMany({
      where: {
        ownerId: user.id,
        status: "PENDING",
        ...filter,
      },
      take: 100,
    });

    if (candidates.length === 0) {
      return NextResponse.json({ error: "No pending reminders found to import." }, { status: 404 });
    }

    const importedReminders = await prisma.$transaction(async (tx) => {
      const results: Array<{ id: string; title: string }> = [];
      const now = new Date();

      for (const item of candidates) {
        const reminder = await tx.reminder.create({
          data: {
            userId: user.id,
            title: item.title,
            description: item.description,
            category: item.category,
            dueAt: item.dueAt,
            recurrence: "NONE",
            notifyDaysBefore: [7, 1, 0],
            notifyInApp: true,
            notifyByEmail: true,
            isCompleted: false,
            isActive: true,
          },
        });

        await tx.emailReminderImport.update({
          where: { id: item.id },
          data: {
            status: "IMPORTED",
            importedReminderId: reminder.id,
            importedAt: now,
          },
        });

        results.push({ id: reminder.id, title: reminder.title });
      }

      return results;
    });

    await createAuditLog({
      userId: user.id,
      action: "EMAIL_REMINDER_IMPORT",
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
      metadata: {
        importedCount: importedReminders.length,
        reminderIds: importedReminders.map((r) => r.id),
      },
    });

    return NextResponse.json({
      success: true,
      count: importedReminders.length,
      reminders: importedReminders,
    });
  } catch (error) {
    console.error("POST /api/integrations/email/reminders/import error:", error);
    return NextResponse.json({ error: "Failed to import reminders." }, { status: 500 });
  }
}

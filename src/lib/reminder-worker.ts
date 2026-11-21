import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/web-push";
import { getAppBaseUrl } from "@/lib/url";
import { escapeHtml } from "@/lib/utils";
import { ONE_DAY_MS as DAY_MS, REMINDER_OFFSETS } from "@/lib/constants";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(from: Date, to: Date) {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);
}

async function deliver(input: {
  userId: string;
  email: string | null;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  key: string;
  title: string;
  message: string;
  actionUrl: string;
  metadata: Record<string, unknown>;
}) {
  if (!input.emailEnabled && !input.inAppEnabled && !input.pushEnabled) return false;
  let notification = await prisma.notification.findUnique({
    where: { idempotencyKey: input.key },
    select: { id: true, emailSentAt: true },
  });
  const isNew = !notification;
  if (!notification) {
    await createNotification({
      userId: input.userId,
      type: "REMINDER_DUE",
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
      metadata: input.metadata,
      idempotencyKey: input.key,
      read: !input.inAppEnabled,
    });
    notification = await prisma.notification.findUnique({
      where: { idempotencyKey: input.key },
      select: { id: true, emailSentAt: true },
    });
  }

  if (input.emailEnabled && input.email && notification && !notification.emailSentAt) {
    try {
      await sendEmail({
        to: input.email,
        subject: input.title,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#172033"><p style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#64748b">VAULTY REMINDER</p><h1 style="font-size:22px">${escapeHtml(input.title)}</h1><p style="font-size:15px;line-height:1.6;color:#475569">${escapeHtml(input.message)}</p><p style="margin-top:28px"><a href="${escapeHtml(getAppBaseUrl() + input.actionUrl)}" style="background:#2563eb;color:white;padding:11px 16px;text-decoration:none;border-radius:7px">Open Vaulty</a></p><p style="font-size:12px;color:#94a3b8;margin-top:32px">Manage reminder notifications in your Vaulty account.</p></div>`,
      });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { emailSentAt: new Date(), emailLastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed";
      await prisma.notification.update({
        where: { id: notification.id },
        data: { emailLastError: message.slice(0, 1000) },
      });
      console.error("[reminders] email delivery failed", message);
    }
  }

  if (input.pushEnabled && notification) {
    const current = await prisma.notification.findUnique({
      where: { id: notification.id },
      select: { pushSentAt: true },
    });
    if (!current?.pushSentAt) {
      const result = await sendPushToUser(input.userId, {
        title: input.title,
        body: input.message,
        url: input.actionUrl,
      });
      if (result.sent > 0) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { pushSentAt: new Date(), pushLastError: null },
        });
      } else if (result.failed > 0) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { pushLastError: "Browser push delivery failed." },
        });
      }
    }
  }
  return isNew;
}

function dueMessage(title: string, days: number) {
  if (days < 0)
    return `${title} is overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}.`;
  if (days === 0) return `${title} is due today.`;
  return `${title} is due in ${days} day${days === 1 ? "" : "s"}.`;
}

export async function processReminderNotifications(now = new Date()) {
  const today = startOfUtcDay(now);
  const endOfWindow = new Date(today.getTime() + 90 * DAY_MS + DAY_MS - 1);
  let created = 0;

  const [documents, reminders, accounts] = await Promise.all([
    prisma.document.findMany({
      where: { expiryDate: { not: null, lte: endOfWindow }, storageStatus: "ACTIVE" },
      select: { id: true, ownerId: true, name: true, expiryDate: true },
    }),
    prisma.reminder.findMany({
      where: { isActive: true, isCompleted: false, dueAt: { lte: endOfWindow } },
    }),
    prisma.wealthAccount.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { expiryDate: { not: null, lte: endOfWindow } },
          { type: "CREDIT_CARD", dueDate: { not: null } },
        ],
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        type: true,
        dueDate: true,
        expiryDate: true,
        paymentNotifyDaysBefore: true,
        expiryNotifyDaysBefore: true,
      },
    }),
  ]);

  const targetUserIds = [
    ...new Set([
      ...documents.map((d) => d.ownerId),
      ...reminders.map((r) => r.userId),
      ...accounts.map((a) => a.ownerId),
    ]),
  ];

  if (targetUserIds.length === 0) {
    return { scanned: 0, notificationsCreated: 0 };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: targetUserIds } },
    select: {
      id: true,
      email: true,
      name: true,
      reminderEmailsEnabled: true,
      reminderInAppEnabled: true,
      pushNotificationsEnabled: true,
    },
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  for (const doc of documents) {
    if (!doc.expiryDate) continue;
    const days = daysBetween(today, doc.expiryDate);
    if (!REMINDER_OFFSETS.includes(days)) continue;
    const user = userById.get(doc.ownerId);
    if (!user) continue;
    const title = days === 0 ? "Document expires today" : "Document expiry approaching";
    const message = dueMessage(doc.name, days);
    const sent = await deliver({
      userId: user.id,
      email: user.email,
      emailEnabled: user.reminderEmailsEnabled,
      inAppEnabled: user.reminderInAppEnabled,
      pushEnabled: user.pushNotificationsEnabled,
      key: `document-expiry:${doc.id}:${doc.expiryDate.toISOString().slice(0, 10)}:${days}`,
      title,
      message,
      actionUrl: `/documents/${doc.id}`,
      metadata: { documentId: doc.id, daysUntil: days, expiryDate: doc.expiryDate.toISOString() },
    });
    if (sent) created++;
  }

  for (const reminder of reminders) {
    const user = userById.get(reminder.userId);
    if (!user) continue;
    const days = daysBetween(today, reminder.dueAt);
    if (!reminder.notifyDaysBefore.includes(days)) continue;
    const title = days === 0 ? `Due today: ${reminder.title}` : `Reminder: ${reminder.title}`;
    const message = reminder.description
      ? `${dueMessage(reminder.title, days)} ${reminder.description}`
      : dueMessage(reminder.title, days);
    const sent = await deliver({
      userId: reminder.userId,
      email: user.email,
      emailEnabled: reminder.notifyByEmail && user.reminderEmailsEnabled,
      inAppEnabled: reminder.notifyInApp && user.reminderInAppEnabled,
      pushEnabled: user.pushNotificationsEnabled,
      key: `custom-reminder:${reminder.id}:${reminder.dueAt.toISOString().slice(0, 10)}:${days}`,
      title,
      message,
      actionUrl: "/reminders",
      metadata: { reminderId: reminder.id, daysUntil: days, dueAt: reminder.dueAt.toISOString() },
    });
    if (sent) created++;
  }

  for (const account of accounts) {
    const user = userById.get(account.ownerId);
    if (!user) continue;
    if (account.expiryDate) {
      const days = daysBetween(today, account.expiryDate);
      const expiryNotifyDays = Array.isArray(account.expiryNotifyDaysBefore)
        ? account.expiryNotifyDaysBefore
        : REMINDER_OFFSETS;
      if (expiryNotifyDays.includes(days)) {
        const sent = await deliver({
          userId: user.id,
          email: user.email,
          emailEnabled: user.reminderEmailsEnabled,
          inAppEnabled: user.reminderInAppEnabled,
          pushEnabled: user.pushNotificationsEnabled,
          key: `wealth-expiry:${account.id}:${account.expiryDate.toISOString().slice(0, 10)}:${days}`,
          title: "Account or policy expiry approaching",
          message: dueMessage(account.name, days),
          actionUrl: "/wealth",
          metadata: { accountId: account.id, daysUntil: days },
        });
        if (sent) created++;
      }
    }
    if (
      account.type === "CREDIT_CARD" &&
      typeof account.dueDate === "number" &&
      account.dueDate >= 1 &&
      account.dueDate <= 31
    ) {
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth();
      const daysInCurrentMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const validDueDay = Math.min(Math.floor(account.dueDate), daysInCurrentMonth);
      const due = new Date(Date.UTC(year, month, validDueDay));

      let nextDue: Date;
      if (due < today) {
        const daysInNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
        const validNextDueDay = Math.min(Math.floor(account.dueDate), daysInNextMonth);
        nextDue = new Date(Date.UTC(year, month + 1, validNextDueDay));
      } else {
        nextDue = due;
      }
      const days = daysBetween(today, nextDue);
      const paymentNotifyDays = Array.isArray(account.paymentNotifyDaysBefore)
        ? account.paymentNotifyDaysBefore
        : [7, 3, 1, 0];
      if (paymentNotifyDays.includes(days)) {
        const sent = await deliver({
          userId: user.id,
          email: user.email,
          emailEnabled: user.reminderEmailsEnabled,
          inAppEnabled: user.reminderInAppEnabled,
          pushEnabled: user.pushNotificationsEnabled,
          key: `wealth-payment:${account.id}:${nextDue.toISOString().slice(0, 10)}:${days}`,
          title: days === 0 ? "Credit card payment due today" : "Credit card payment coming up",
          message: dueMessage(`${account.name} payment`, days),
          actionUrl: "/wealth",
          metadata: { accountId: account.id, dueAt: nextDue.toISOString(), daysUntil: days },
        });
        if (sent) created++;
      }
    }
  }

  // Retry recent email deliveries that previously failed, even when their original lead-time offset has passed.
  const failedEmails = await prisma.notification.findMany({
    where: {
      type: "REMINDER_DUE",
      emailSentAt: null,
      emailLastError: { not: null },
      createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS), lt: today },
      user: { reminderEmailsEnabled: true, email: { not: null } },
    },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const notification of failedEmails) {
    if (!notification.user.email) continue;
    try {
      await sendEmail({
        to: notification.user.email,
        subject: notification.title,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#172033"><p style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#64748b">VAULTY REMINDER</p><h1 style="font-size:22px">${escapeHtml(notification.title)}</h1><p style="font-size:15px;line-height:1.6;color:#475569">${escapeHtml(notification.message)}</p><p style="margin-top:28px"><a href="${escapeHtml(getAppBaseUrl() + (notification.actionUrl || "/reminders"))}" style="background:#2563eb;color:white;padding:11px 16px;text-decoration:none;border-radius:7px">Open Vaulty</a></p></div>`,
      });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { emailSentAt: new Date(), emailLastError: null },
      });
    } catch (error) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          emailLastError: (error instanceof Error ? error.message : "Email delivery failed").slice(
            0,
            1000,
          ),
        },
      });
    }
  }

  return {
    notificationsCreated: created,
    documentsChecked: documents.length,
    remindersChecked: reminders.length,
    accountsChecked: accounts.length,
    failedEmailsRetried: failedEmails.length,
  };
}

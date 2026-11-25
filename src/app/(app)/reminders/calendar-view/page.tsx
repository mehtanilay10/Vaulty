import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ReminderCalendarClient,
  type CalendarEvent,
} from "@/components/reminders/ReminderCalendarClient";

export const metadata = {
  title: "Calendar View | Vaulty",
  description: "View reminders, document renewals, and credit card dues on a monthly calendar.",
};

export default async function ReminderCalendarPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const [reminders, documents, creditCards] = await Promise.all([
    prisma.reminder.findMany({
      where: { userId, isActive: true },
      select: { id: true, title: true, dueAt: true, category: true, isCompleted: true },
    }),
    prisma.document.findMany({
      where: { ownerId: userId, expiryDate: { not: null }, storageStatus: "ACTIVE" },
      select: { id: true, name: true, expiryDate: true },
    }),
    prisma.wealthAccount.findMany({
      where: { ownerId: userId, status: "ACTIVE", type: "CREDIT_CARD", dueDate: { not: null } },
      select: { id: true, name: true, dueDate: true },
    }),
  ]);

  const events: CalendarEvent[] = [];

  // Map reminders
  for (const r of reminders) {
    events.push({
      id: `rem-${r.id}`,
      type: "REMINDER",
      title: r.title,
      date: r.dueAt.toISOString().slice(0, 10),
      category: r.category,
      isCompleted: r.isCompleted,
      link: "/reminders",
    });
  }

  // Map document expiries
  for (const d of documents) {
    if (d.expiryDate) {
      events.push({
        id: `doc-${d.id}`,
        type: "DOCUMENT_EXPIRY",
        title: `${d.name} expires`,
        date: d.expiryDate.toISOString().slice(0, 10),
        link: `/documents/${d.id}`,
      });
    }
  }

  // Map credit card due dates for current year (all 12 months)
  const currentYear = new Date().getFullYear();
  for (const cc of creditCards) {
    if (cc.dueDate && cc.dueDate >= 1 && cc.dueDate <= 31) {
      for (let month = 0; month < 12; month++) {
        // Safe date creation for month
        const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
        const day = Math.min(cc.dueDate, daysInMonth);
        const dateStr = `${currentYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        events.push({
          id: `cc-${cc.id}-${month}`,
          type: "CREDIT_CARD_DUE",
          title: `${cc.name} payment due`,
          date: dateStr,
          link: `/wealth/accounts/${cc.id}`,
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <ReminderCalendarClient events={events} />
    </div>
  );
}

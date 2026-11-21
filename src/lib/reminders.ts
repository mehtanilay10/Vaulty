import { prisma } from "@/lib/prisma";

/**
 * Get documents expiring within a specified number of days
 */
export async function getExpiringDocuments(userId: string, days: number = 90) {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  return prisma.document.findMany({
    where: {
      ownerId: userId,
      expiryDate: {
        lte: futureDate,
        gte: today,
      },
    },
    include: {
      folder: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      expiryDate: "asc",
    },
  });
}

/**
 * Get documents that have already expired
 */
export async function getExpiredDocuments(userId: string) {
  const today = new Date();

  return prisma.document.findMany({
    where: {
      ownerId: userId,
      expiryDate: {
        lt: today,
      },
    },
    include: {
      folder: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      expiryDate: "asc",
    },
  });
}

/**
 * Get wealth accounts with upcoming reminders
 */
export async function getWealthReminders(userId: string) {
  const today = new Date();

  const accounts = await prisma.wealthAccount.findMany({
    where: {
      ownerId: userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      type: true,
      dueDate: true,
      expiryDate: true,
    },
  });

  const reminders: Array<{
    accountId: string;
    accountName: string;
    type: string;
    reminderType: string;
    dueDate: number | Date | null;
    daysUntil: number;
  }> = [];

  for (const account of accounts) {
    // Credit card payment due (within 7 days)
    if (account.type === "CREDIT_CARD" && account.dueDate) {
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const dueDay = Math.min(account.dueDate, daysInMonth);
      const currentDay = today.getDate();
      const daysUntilDue =
        dueDay >= currentDay ? dueDay - currentDay : daysInMonth - currentDay + dueDay;

      if (daysUntilDue <= 7) {
        reminders.push({
          accountId: account.id,
          accountName: account.name,
          type: account.type,
          reminderType: "PAYMENT_DUE",
          dueDate: account.dueDate,
          daysUntil: daysUntilDue,
        });
      }
    }

    // Expiry date (within 30 days)
    if (account.expiryDate) {
      const expiry = new Date(account.expiryDate);
      const daysUntilExpiry = Math.ceil(
        (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilExpiry <= 30 && daysUntilExpiry >= 0) {
        reminders.push({
          accountId: account.id,
          accountName: account.name,
          type: account.type,
          reminderType: "EXPIRY",
          dueDate: account.expiryDate,
          daysUntil: daysUntilExpiry,
        });
      }
    }
  }

  return reminders.sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * Get all reminders for a user (documents + wealth)
 */
export async function getAllReminders(userId: string) {
  const [expiringDocs, expiredDocs, wealthReminders] = await Promise.all([
    getExpiringDocuments(userId, 90),
    getExpiredDocuments(userId),
    getWealthReminders(userId),
  ]);

  return {
    documents: {
      expiring: expiringDocs,
      expired: expiredDocs,
    },
    wealth: wealthReminders,
  };
}

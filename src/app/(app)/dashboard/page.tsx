import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateWealthSummary, getUpcomingReminders } from "@/lib/wealth";
import type { User } from "@/types";
import { DashboardOverviewClient } from "@/components/dashboard/DashboardOverviewClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const now = new Date();
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(now.getDate() + 90);

  const [
    recentDocuments,
    totalDocuments,
    totalFolders,
    aiCompletedCount,
    expiringDocuments,
    vault,
    sharedVaultCount,
    allWealthAccounts,
    upcomingCustomReminders,
    driveConnection,
  ] = await Promise.all([
    prisma.document.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        folder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.document.count({ where: { ownerId: userId } }),
    prisma.folder.count({ where: { ownerId: userId } }),
    prisma.aiProcessing.count({
      where: { document: { ownerId: userId }, status: "COMPLETED" },
    }),
    prisma.document.findMany({
      where: {
        ownerId: userId,
        expiryDate: {
          not: null,
          lte: ninetyDaysFromNow,
        },
      },
      orderBy: { expiryDate: "asc" },
      take: 4,
      select: {
        id: true,
        name: true,
        expiryDate: true,
        folder: { select: { id: true, name: true } },
      },
    }),
    prisma.passwordVault.findUnique({
      where: { userId },
      select: {
        id: true,
        isConfigured: true,
        _count: { select: { appCredentials: true, bankCredentials: true } },
        appCredentials: {
          where: { isFavorite: true },
          select: { id: true },
        },
        bankCredentials: {
          where: { isFavorite: true },
          select: { id: true },
        },
      },
    }),
    prisma.vaultShare.count({ where: { sharedWithId: userId } }),
    prisma.wealthAccount.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        currentBalance: true,
        currency: true,
        creditLimit: true,
        category: true,
        dueDate: true,
        expiryDate: true,
      },
    }),
    prisma.reminder.findMany({
      where: { userId, isActive: true, isCompleted: false, dueAt: { lte: ninetyDaysFromNow } },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: { id: true, title: true, category: true, dueAt: true, recurrence: true },
    }),
    prisma.storageConnection.findFirst({
      where: { userId, provider: "GOOGLE_DRIVE", status: "CONNECTED" },
      select: { id: true },
    }),
  ]);

  const activeWealthAccounts = allWealthAccounts.filter((account) => account.status === "ACTIVE");
  const recentWealthAccounts = allWealthAccounts.slice(0, 3);
  const favoriteCount =
    (vault?.appCredentials?.length ?? 0) + (vault?.bankCredentials?.length ?? 0);

  const { summary, currency } = calculateWealthSummary(activeWealthAccounts);
  const reminders = getUpcomingReminders(activeWealthAccounts).map((reminder) => ({
    ...reminder,
    dueDate: reminder.dueDate instanceof Date ? reminder.dueDate.toISOString() : reminder.dueDate,
  }));

  return (
    <>
      <Suspense fallback={null}>
        <DashboardOverviewClient
          user={session.user as User}
          documents={{
            total: totalDocuments,
            folders: totalFolders,
            aiSummaries: aiCompletedCount,
            recent: JSON.parse(JSON.stringify(recentDocuments)),
            expiring: expiringDocuments.map((doc) => ({
              ...doc,
              expiryDate: doc.expiryDate?.toISOString() || null,
            })),
          }}
          credentials={{
            hasVault: Boolean(vault?.isConfigured),
            appCount: vault?._count.appCredentials ?? 0,
            bankCount: vault?._count.bankCredentials ?? 0,
            favoriteCount,
            sharedCount: sharedVaultCount,
          }}
          wealth={{
            summary: { ...summary, currency },
            accounts: JSON.parse(JSON.stringify(recentWealthAccounts)),
            reminders,
          }}
          customReminders={upcomingCustomReminders.map((item) => ({
            ...item,
            dueAt: item.dueAt.toISOString(),
          }))}
          initialDriveConnected={Boolean(driveConnection)}
        />
      </Suspense>
    </>
  );
}

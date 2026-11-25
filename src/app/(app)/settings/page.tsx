import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { User } from "@/types";
import { SettingsClient } from "@/components/settings/SettingsClient";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = session.user;

  const [
    recentEvents,
    stats,
    recentAiProcessing,
    passwordVault,
    gmailConnection,
    outlookConnection,
    userPreferences,
  ] = await Promise.all([
    prisma.syncEvent.findMany({
      where: { userId: session.user.id, provider: "GOOGLE_DRIVE" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        document: { select: { id: true, name: true } },
      },
    }),
    prisma.syncEvent.groupBy({
      by: ["status"],
      where: { userId: session.user.id, provider: "GOOGLE_DRIVE" },
      _count: { id: true },
    }),
    prisma.aiProcessing.findMany({
      where: { document: { ownerId: session.user.id } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        document: { select: { id: true, name: true } },
      },
    }),
    prisma.passwordVault.findUnique({
      where: { userId: session.user.id },
      select: { id: true, isConfigured: true },
    }),
    prisma.gmailConnection.findUnique({
      where: { ownerId: session.user.id },
      select: {
        emailAddress: true,
        status: true,
        lastSyncedAt: true,
        connectedAt: true,
      },
    }),
    prisma.outlookConnection.findUnique({
      where: { ownerId: session.user.id },
      select: {
        emailAddress: true,
        status: true,
        lastSyncedAt: true,
        connectedAt: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        reminderEmailsEnabled: true,
        reminderInAppEnabled: true,
        pushNotificationsEnabled: true,
      },
    }),
  ]);

  const syncedCount = stats.find((s) => s.status === "SUCCESS")?._count.id || 0;
  const failedCount = stats.find((s) => s.status === "FAILED")?._count.id || 0;
  const pendingCount = stats.find((s) => s.status === "PENDING")?._count.id || 0;

  return (
    <>
      <SettingsClient
        user={user as User}
        recentEvents={JSON.parse(JSON.stringify(recentEvents))}
        syncStats={{ synced: syncedCount, failed: failedCount, pending: pendingCount }}
        recentAiProcessing={JSON.parse(JSON.stringify(recentAiProcessing))}
        hasVault={Boolean(passwordVault?.isConfigured)}
        emailSync={{
          gmail: JSON.parse(JSON.stringify(gmailConnection)),
          outlook: JSON.parse(JSON.stringify(outlookConnection)),
        }}
        notificationPreferences={userPreferences || undefined}
      />
    </>
  );
}

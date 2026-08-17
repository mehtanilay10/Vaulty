import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SyncCenterClient } from "@/components/settings/SyncCenterClient";

export default async function SyncCenterPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [connection, recentEvents, stats] = await Promise.all([
    prisma.storageConnection.findFirst({
      where: { userId: session.user.id, provider: "GOOGLE_DRIVE" },
      select: {
        id: true,
        status: true,
        lastSyncedAt: true,
        rootFolderId: true,
        docsFolderId: true,
      },
    }),
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
  ]);

  const syncedCount = stats.find((s) => s.status === "SUCCESS")?._count.id || 0;
  const failedCount = stats.find((s) => s.status === "FAILED")?._count.id || 0;
  const pendingCount = stats.find((s) => s.status === "PENDING")?._count.id || 0;

  return (
    <SyncCenterClient
      user={session.user}
      connection={connection}
      recentEvents={JSON.parse(JSON.stringify(recentEvents))}
      stats={{ synced: syncedCount, failed: failedCount, pending: pendingCount }}
    />
  );
}

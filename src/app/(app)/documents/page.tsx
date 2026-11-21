import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DocumentsOverviewClient } from "@/components/documents/DocumentsOverviewClient";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const now = new Date();
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(now.getDate() + 90);

  const [
    recentDocuments,
    myFolders,
    sharedShares,
    totalDocumentsCount,
    totalFoldersCount,
    aiCompletedCount,
    expiringDocuments,
    driveConnection,
  ] = await Promise.all([
    prisma.document.findMany({
      where: { ownerId: userId },
      include: {
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        aiProcessing: { select: { status: true, processedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.folder.findMany({
      where: { ownerId: userId, parentId: null },
      include: {
        _count: { select: { documents: true, children: true } },
        shares: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.folderShare.findMany({
      where: { sharedWithUserId: userId },
      include: {
        folder: {
          include: {
            owner: { select: { id: true, name: true, email: true, image: true } },
            _count: { select: { documents: true, children: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
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
      take: 5,
      select: {
        id: true,
        name: true,
        expiryDate: true,
        folder: { select: { id: true, name: true } },
      },
    }),
    prisma.storageConnection.findFirst({
      where: { userId, provider: "GOOGLE_DRIVE", status: "CONNECTED" },
      select: { id: true },
    }),
  ]);

  const sharedFolders = sharedShares.map((s) => s.folder);

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Documents" }]} />
      <Suspense fallback={null}>
        <DocumentsOverviewClient
          recentDocuments={JSON.parse(JSON.stringify(recentDocuments))}
          myFolders={JSON.parse(JSON.stringify(myFolders))}
          sharedFolders={JSON.parse(JSON.stringify(sharedFolders))}
          expiringDocuments={expiringDocuments.map((doc) => ({
            ...doc,
            expiryDate: doc.expiryDate?.toISOString() || null,
          }))}
          stats={{
            totalDocuments: totalDocumentsCount,
            totalFolders: totalFoldersCount,
            aiSummaries: aiCompletedCount,
          }}
          initialDriveConnected={Boolean(driveConnection)}
        />
      </Suspense>
    </>
  );
}

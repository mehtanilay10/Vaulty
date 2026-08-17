import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const recentDocuments = await prisma.document.findMany({
    where: { ownerId: userId },
    include: {
      folder: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      aiProcessing: { select: { status: true, processedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const myFolders = await prisma.folder.findMany({
    where: { ownerId: userId, parentId: null },
    include: {
      _count: { select: { documents: true, children: true } },
      shares: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  const sharedShares = await prisma.folderShare.findMany({
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
  });

  const sharedFolders = sharedShares.map((s) => s.folder);

  const totalDocumentsCount = await prisma.document.count({ where: { ownerId: userId } });
  const totalFoldersCount = await prisma.folder.count({ where: { ownerId: userId } });
  const aiCompletedCount = await prisma.aiProcessing.count({
    where: { document: { ownerId: userId }, status: "COMPLETED" },
  });

  return (
    <DashboardClient
      user={session.user}
      recentDocuments={JSON.parse(JSON.stringify(recentDocuments))}
      myFolders={JSON.parse(JSON.stringify(myFolders))}
      sharedFolders={JSON.parse(JSON.stringify(sharedFolders))}
      stats={{
        totalDocuments: totalDocumentsCount,
        totalFolders: totalFoldersCount,
        aiSummaries: aiCompletedCount,
      }}
    />
  );
}

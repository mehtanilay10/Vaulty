import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DocumentsClient } from "@/components/documents/DocumentsClient";

export default async function DocumentLibraryPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const [documents, totalDocuments] = await Promise.all([
    prisma.document.findMany({
      where: { ownerId: userId },
      include: {
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        aiProcessing: { select: { status: true, processedAt: true, updatedAt: true } },
        owner: { select: { id: true, name: true, image: true } },
        shareLinks: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.document.count({ where: { ownerId: userId } }),
  ]);

  const folders = await prisma.folder.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <Suspense fallback={null}>
        <DocumentsClient
          initialDocuments={JSON.parse(JSON.stringify(documents))}
          folders={JSON.parse(JSON.stringify(folders))}
          currentUserId={userId}
          initialHasMore={totalDocuments > documents.length}
          initialTotal={totalDocuments}
        />
      </Suspense>
    </>
  );
}

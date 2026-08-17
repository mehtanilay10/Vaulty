import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DocumentsClient } from "@/components/documents/DocumentsClient";

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const documents = await prisma.document.findMany({
    where: { ownerId: userId },
    include: {
      folder: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      aiProcessing: { select: { status: true, processedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const documentsWithStorage = documents.map((d) => ({
    ...d,
    storageProvider: (d as any).storageProvider,
    storageFileId: (d as any).storageFileId,
  }));

  const folders = await prisma.folder.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <DocumentsClient
      initialDocuments={JSON.parse(JSON.stringify(documentsWithStorage))}
      folders={JSON.parse(JSON.stringify(folders))}
    />
  );
}

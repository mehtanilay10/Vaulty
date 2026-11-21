import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { notFound } from "next/navigation";
import { FolderDetailClient } from "@/components/folders/FolderDetailClient";

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { folderId } = await params;
  const access = await checkFolderAccess(session.user.id, folderId);

  if (!access.hasAccess) {
    notFound();
  }

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
      parent: { select: { id: true, name: true } },
      children: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { documents: true, children: true } },
        },
        orderBy: { name: "asc" },
      },
      documents: {
        include: {
          tags: { include: { tag: true } },
          aiProcessing: { select: { status: true, processedAt: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      shares: {
        include: {
          sharedWith: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  if (!folder) {
    notFound();
  }

  // Construct breadcrumb hierarchy in a single batch query
  const breadcrumbs = [{ id: folder.id, name: folder.name }];
  if (folder.parentId) {
    const ownerFolders = await prisma.folder.findMany({
      where: { ownerId: folder.ownerId },
      select: { id: true, name: true, parentId: true },
    });
    const folderMap = new Map(ownerFolders.map((f) => [f.id, f]));
    let cursor: string | null = folder.parentId;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const parent = folderMap.get(cursor);
      if (!parent) break;
      breadcrumbs.unshift({ id: parent.id, name: parent.name });
      cursor = parent.parentId;
    }
  }

  return (
    <FolderDetailClient
      folder={JSON.parse(JSON.stringify(folder))}
      breadcrumbs={breadcrumbs}
      isOwner={access.isOwner}
    />
  );
}

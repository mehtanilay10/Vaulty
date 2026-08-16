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

  // Construct breadcrumb hierarchy
  const breadcrumbs = [];
  let curr: any = folder;
  while (curr) {
    breadcrumbs.unshift({ id: curr.id, name: curr.name });
    if (curr.parentId) {
      curr = await prisma.folder.findUnique({
        where: { id: curr.parentId },
        select: { id: true, name: true, parentId: true },
      });
    } else {
      curr = null;
    }
  }

  return (
    <FolderDetailClient
      folder={JSON.parse(JSON.stringify(folder))}
      breadcrumbs={breadcrumbs}
      isOwner={access.isOwner}
      permission={access.permission}
    />
  );
}

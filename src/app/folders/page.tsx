import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FoldersClient } from "@/components/folders/FoldersClient";

export default async function FoldersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const folders = await prisma.folder.findMany({
    where: { ownerId: userId, parentId: null },
    include: {
      _count: { select: { documents: true, children: true } },
      shares: { select: { id: true, sharedWith: { select: { name: true, email: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return <FoldersClient initialFolders={JSON.parse(JSON.stringify(folders))} />;
}

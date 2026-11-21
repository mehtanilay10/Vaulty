import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FoldersClient } from "@/components/folders/FoldersClient";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

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

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Documents", href: "/documents" },
          { label: "Folders" },
        ]}
      />
      <FoldersClient initialFolders={JSON.parse(JSON.stringify(folders))} />
    </>
  );
}

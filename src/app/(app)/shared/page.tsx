import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SharedClient } from "@/components/shared/SharedClient";

export default async function SharedPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const shares = await prisma.folderShare.findMany({
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

  const sharedFolders = shares.map((s) => ({
    ...s.folder,
    shareCreatedAt: s.createdAt,
    permission: s.permission,
  }));

  return (
    <>
      <SharedClient sharedFolders={JSON.parse(JSON.stringify(sharedFolders))} />
    </>
  );
}

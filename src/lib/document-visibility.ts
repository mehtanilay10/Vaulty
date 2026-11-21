import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Documents visible to a user through ownership, folder shares or family sharing. */
export async function getVisibleDocumentWhere(userId: string): Promise<Prisma.DocumentWhereInput> {
  const [sharedFolderRows, familyMemberships] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE shared_tree AS (
        SELECT f.id FROM "Folder" f
        INNER JOIN "FolderShare" fs ON fs."folderId" = f.id
        WHERE fs."sharedWithUserId" = ${userId}
        UNION
        SELECT child.id FROM "Folder" child
        INNER JOIN shared_tree parent ON child."parentId" = parent.id
      )
      SELECT DISTINCT id FROM shared_tree
    `,
    prisma.familyMembership.findMany({
      where: { memberId: userId, shareDocuments: true },
      select: { ownerId: true },
    }),
  ]);

  const sharedFolderIds = sharedFolderRows.map((row) => row.id);
  const familyOwnerIds = familyMemberships.map((membership) => membership.ownerId);

  return {
    OR: [
      { ownerId: userId },
      ...(sharedFolderIds.length ? [{ folderId: { in: sharedFolderIds } }] : []),
      ...(familyOwnerIds.length ? [{ ownerId: { in: familyOwnerIds } }] : []),
    ],
  };
}

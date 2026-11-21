import { prisma } from "@/lib/prisma";
import { hasFamilyModuleAccess } from "@/lib/family-access";

export interface DocumentAccessResult {
  hasAccess: boolean;
  isOwner: boolean;
  isShared: boolean;
  permission: "OWNER" | "READ_ONLY" | "NONE";
}

export interface FolderAccessResult {
  hasAccess: boolean;
  isOwner: boolean;
  isShared: boolean;
  permission: "OWNER" | "READ_ONLY" | "NONE";
}

// IDs are generated with cuid(), so a conservative identifier check is enough
// to reject malformed values before they reach the raw query.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Checks whether a given user has read or owner access to a specific folder.
 * Uses a recursive CTE to fetch the entire ancestor chain in one query,
 * then checks for shares in a single query.
 */
export async function checkFolderAccess(
  userId: string,
  folderId: string,
): Promise<FolderAccessResult> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, ownerId: true, parentId: true },
  });

  if (!folder) {
    return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
  }

  if (folder.ownerId === userId) {
    return { hasAccess: true, isOwner: true, isShared: false, permission: "OWNER" };
  }

  const directShare = await prisma.folderShare.findUnique({
    where: {
      folderId_sharedWithUserId: {
        folderId,
        sharedWithUserId: userId,
      },
    },
  });

  if (directShare) {
    return { hasAccess: true, isOwner: false, isShared: true, permission: "READ_ONLY" };
  }

  if (!folder.parentId) {
    const familyAccess = await hasFamilyModuleAccess(userId, folder.ownerId, "documents");
    if (familyAccess) {
      return {
        hasAccess: true,
        isOwner: false,
        isShared: true,
        permission: "READ_ONLY",
      };
    }

    return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
  }

  // Prisma tagged templates parameterize interpolated values, but reject
  // malformed identifiers as defense-in-depth before the recursive CTE.
  if (!SAFE_IDENTIFIER_PATTERN.test(folder.parentId)) {
    return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
  }

  const ancestorRows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId" FROM "Folder" WHERE id = ${folder.parentId}
      UNION
      SELECT f.id, f."parentId" FROM "Folder" f
      INNER JOIN ancestors a ON f.id = a."parentId"
    )
    SELECT id FROM ancestors
  `;

  const ancestorIds = ancestorRows.map((r) => r.id);

  if (ancestorIds.length === 0) {
    return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
  }

  const ancestorShare = await prisma.folderShare.findFirst({
    where: {
      folderId: { in: ancestorIds },
      sharedWithUserId: userId,
    },
    select: { id: true },
  });

  if (ancestorShare) {
    return { hasAccess: true, isOwner: false, isShared: true, permission: "READ_ONLY" };
  }

  const familyAccess = await hasFamilyModuleAccess(userId, folder.ownerId, "documents");

  if (familyAccess) {
    return {
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    };
  }

  return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
}

/**
 * Checks whether a given user has read or owner access to a document.
 */
export async function checkDocumentAccess(
  userId: string,
  documentId: string,
): Promise<DocumentAccessResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, ownerId: true, folderId: true },
  });

  if (!document) {
    return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
  }

  if (document.ownerId === userId) {
    return { hasAccess: true, isOwner: true, isShared: false, permission: "OWNER" };
  }

  if (!document.folderId) {
    const familyAccess = await hasFamilyModuleAccess(userId, document.ownerId, "documents");
    if (familyAccess) {
      return {
        hasAccess: true,
        isOwner: false,
        isShared: true,
        permission: "READ_ONLY",
      };
    }
    return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
  }

  const folderAccess = await checkFolderAccess(userId, document.folderId);

  if (folderAccess.hasAccess) {
    return {
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    };
  }

  return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
}

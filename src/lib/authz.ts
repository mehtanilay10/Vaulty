import { prisma } from "@/lib/prisma";

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

/**
 * Checks whether a given user has read or owner access to a specific folder.
 * Recursively walks up the parent folder hierarchy if necessary.
 */
export async function checkFolderAccess(
  userId: string,
  folderId: string
): Promise<FolderAccessResult> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, ownerId: true, parentId: true },
  });

  if (!folder) {
    return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
  }

  // Check 1: Owner access
  if (folder.ownerId === userId) {
    return { hasAccess: true, isOwner: true, isShared: false, permission: "OWNER" };
  }

  // Check 2: Direct folder share
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

  // Check 3: Recursive ancestor folder shares
  let currentParentId = folder.parentId;

  while (currentParentId) {
    const parentFolder = await prisma.folder.findUnique({
      where: { id: currentParentId },
      select: { id: true, ownerId: true, parentId: true },
    });

    if (!parentFolder) break;

    if (parentFolder.ownerId === userId) {
      return { hasAccess: true, isOwner: true, isShared: false, permission: "OWNER" };
    }

    const ancestorShare = await prisma.folderShare.findUnique({
      where: {
        folderId_sharedWithUserId: {
          folderId: currentParentId,
          sharedWithUserId: userId,
        },
      },
    });

    if (ancestorShare) {
      return { hasAccess: true, isOwner: false, isShared: true, permission: "READ_ONLY" };
    }

    currentParentId = parentFolder.parentId;
  }

  return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
}

/**
 * Checks whether a given user has read or owner access to a document.
 */
export async function checkDocumentAccess(
  userId: string,
  documentId: string
): Promise<DocumentAccessResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, ownerId: true, folderId: true },
  });

  if (!document) {
    return { hasAccess: false, isOwner: false, isShared: false, permission: "NONE" };
  }

  // Owner check
  if (document.ownerId === userId) {
    return { hasAccess: true, isOwner: true, isShared: false, permission: "OWNER" };
  }

  // Folder permission check (handles recursive share inheritance)
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

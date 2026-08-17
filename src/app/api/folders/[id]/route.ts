import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { deletePrivateBlob } from "@/lib/blob";
import { getProviderForUser, getProviderForDocument } from "@/lib/storage/factory";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const access = await checkFolderAccess(user.id, id);
    if (!access.hasAccess) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const folder = await prisma.folder.findUnique({
      where: { id },
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
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    return NextResponse.json({
      folder,
      permission: access.permission,
      isOwner: access.isOwner,
    });
  } catch (error) {
    console.error("GET /api/folders/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch folder." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const access = await checkFolderAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Read-only users cannot modify folders." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, parentId } = body;

    const folder = await prisma.folder.findUnique({
      where: { id },
      select: { name: true, parentId: true, storageProvider: true, storageFolderId: true },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found." }, { status: 404 });
    }

    const updateData: { name?: string; parentId?: string | null } = {};

    if (name && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }

    let newParentId: string | null | undefined;
    if (parentId !== undefined) {
      if (parentId === id) {
        return NextResponse.json({ error: "A folder cannot be its own parent." }, { status: 400 });
      }
      if (parentId) {
        const parentAccess = await checkFolderAccess(user.id, parentId);
        if (!parentAccess.isOwner) {
          return NextResponse.json({ error: "You can only move folders to folders you own." }, { status: 403 });
        }
      }
      newParentId = parentId || null;
      updateData.parentId = newParentId;
    }

    const updatedFolder = await prisma.folder.update({
      where: { id },
      data: updateData,
    });

    if (folder.storageProvider === "GOOGLE_DRIVE" && folder.storageFolderId) {
      try {
        const { provider } = await getProviderForUser(user.id, "GOOGLE_DRIVE");

        if (name && name.trim() && name.trim() !== folder.name) {
          await provider.renameFolder(folder.storageFolderId, name.trim());
        }

        if (newParentId !== undefined && newParentId !== folder.parentId) {
          let newDriveParentId: string | null | undefined;

          if (newParentId) {
            const newParentFolder = await prisma.folder.findUnique({
              where: { id: newParentId },
              select: { storageFolderId: true },
            });
            newDriveParentId = newParentFolder?.storageFolderId || undefined;
          }

          await provider.moveFolder(folder.storageFolderId, newDriveParentId || null);
        }
      } catch (driveError) {
        console.error("Failed to sync folder change to Drive:", driveError);
      }
    }

    return NextResponse.json({ folder: updatedFolder });
  } catch (error) {
    console.error("PATCH /api/folders/[id] error:", error);
    return NextResponse.json({ error: "Failed to update folder." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const access = await checkFolderAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Read-only users cannot delete folders." },
        { status: 403 }
      );
    }

    const getAllFolderIds = async (rootId: string): Promise<string[]> => {
      const children = await prisma.folder.findMany({
        where: { parentId: rootId },
        select: { id: true },
      });
      let ids = [rootId];
      for (const child of children) {
        const childIds = await getAllFolderIds(child.id);
        ids = ids.concat(childIds);
      }
      return ids;
    };

    const allFolderIds = await getAllFolderIds(id);

    const documentsToDelete = await prisma.document.findMany({
      where: { folderId: { in: allFolderIds } },
      select: { blobUrl: true, storageProvider: true, storageFileId: true, id: true },
    });

    for (const doc of documentsToDelete) {
      if (doc.storageProvider === "GOOGLE_DRIVE" && doc.storageFileId) {
        try {
          const { provider } = await getProviderForDocument({
            id: doc.id,
            storageProvider: doc.storageProvider,
            storageFileId: doc.storageFileId,
            ownerId: user.id,
            folderId: id,
          });
          await provider.deleteFile(doc.storageFileId);
        } catch (driveError) {
          console.error("Drive delete error for document:", driveError);
        }
      }
      if (doc.blobUrl) {
        await deletePrivateBlob(doc.blobUrl);
      }
    }

    const foldersToDelete = await prisma.folder.findMany({
      where: { id: { in: allFolderIds } },
      select: { id: true, name: true, storageProvider: true, storageFolderId: true },
    });

    for (const folder of foldersToDelete) {
      if (folder.storageProvider === "GOOGLE_DRIVE" && folder.storageFolderId) {
        try {
          const { provider } = await getProviderForUser(user.id, "GOOGLE_DRIVE");
          await provider.deleteFolder(folder.storageFolderId);
        } catch (driveError) {
          console.error("Drive folder delete error:", driveError);
        }
      }
    }

    await prisma.folder.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        action: "FOLDER_DELETE",
        userId: user.id,
        folderId: id,
        metadata: JSON.stringify({ deletedFolderIdsCount: allFolderIds.length }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/folders/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete folder." }, { status: 500 });
  }
}

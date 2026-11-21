import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { getProviderForUser, getProviderForDocument } from "@/lib/storage/factory";
import { validateCSRFRequest } from "@/lib/csrf";
import { getFolderHierarchyPath } from "@/lib/folder-path";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }
    const access = await checkFolderAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Read-only users cannot modify folders." },
        { status: 403 },
      );
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
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
      const sanitizedName = name.trim().replace(/[/\\?%*:|"<>]/g, "_");
      if (!sanitizedName) {
        return NextResponse.json({ error: "Folder name is invalid or empty." }, { status: 400 });
      }
      updateData.name = sanitizedName;
    }

    let newParentId: string | null | undefined;
    if (parentId !== undefined) {
      if (parentId === id) {
        return NextResponse.json({ error: "A folder cannot be its own parent." }, { status: 400 });
      }
      if (parentId) {
        // Prevent moving a folder into its own descendant (cycle).
        const ownerFolders = await prisma.folder.findMany({
          where: { ownerId: user.id },
          select: { id: true, parentId: true },
        });
        const folderMap = new Map(ownerFolders.map((f) => [f.id, f.parentId]));
        let cursor: string | null = parentId;
        const visited = new Set<string>();
        while (cursor) {
          if (cursor === id) {
            return NextResponse.json(
              { error: "A folder cannot be moved into its own descendant." },
              { status: 400 },
            );
          }
          if (visited.has(cursor)) break;
          visited.add(cursor);
          cursor = folderMap.get(cursor) ?? null;
        }

        const parentAccess = await checkFolderAccess(user.id, parentId);
        if (!parentAccess.isOwner) {
          return NextResponse.json(
            { error: "You can only move folders to folders you own." },
            { status: 403 },
          );
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
              select: { storageFolderId: true, name: true, parentId: true },
            });

            if (newParentFolder?.storageFolderId) {
              newDriveParentId = newParentFolder.storageFolderId;
            } else if (newParentFolder) {
              const pathNames = await getFolderHierarchyPath(newParentId);
              const vaultyFolders = await provider.ensureVaultyFolders();
              newDriveParentId = await provider.createFolderPath(pathNames, vaultyFolders.docs);
              await prisma.folder.update({
                where: { id: newParentId },
                data: { storageFolderId: newDriveParentId },
              });
            }
          }

          if (newDriveParentId === undefined && newParentId === null) {
            const vaultyFolders = await provider.ensureVaultyFolders();
            newDriveParentId = vaultyFolders.docs;
          }

          if (newDriveParentId !== undefined) {
            await provider.moveFolder(folder.storageFolderId, newDriveParentId);
          }
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }
    const access = await checkFolderAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Read-only users cannot delete folders." },
        { status: 403 },
      );
    }

    // Batch fetch all user folders in a single query and collect descendant IDs in memory
    const userFolders = await prisma.folder.findMany({
      where: { ownerId: user.id },
      select: { id: true, parentId: true },
    });
    const childrenByParent = new Map<string, string[]>();
    for (const f of userFolders) {
      if (f.parentId) {
        const list = childrenByParent.get(f.parentId) || [];
        list.push(f.id);
        childrenByParent.set(f.parentId, list);
      }
    }
    const allFolderIds: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      allFolderIds.push(current);
      const children = childrenByParent.get(current);
      if (children) {
        queue.push(...children);
      }
    }

    const documentsToDelete = await prisma.document.findMany({
      where: { folderId: { in: allFolderIds } },
      select: {
        id: true,
        storageProvider: true,
        storageFileId: true,
        googleDriveSummaryFileId: true,
        googleDriveTextFileId: true,
        googleDriveInterpretationFileId: true,
      },
    });

    for (const doc of documentsToDelete) {
      if (doc.storageProvider === "GOOGLE_DRIVE") {
        const fileIdsToDelete = [
          doc.storageFileId,
          doc.googleDriveSummaryFileId,
          doc.googleDriveTextFileId,
          doc.googleDriveInterpretationFileId,
        ].filter((f): f is string => Boolean(f));

        if (fileIdsToDelete.length > 0) {
          try {
            const { provider } = await getProviderForDocument({
              id: doc.id,
              storageProvider: doc.storageProvider,
              storageFileId: doc.storageFileId || fileIdsToDelete[0],
              ownerId: user.id,
              folderId: id,
            });
            for (const fileId of fileIdsToDelete) {
              try {
                await provider.deleteFile(fileId);
              } catch (driveErr) {
                console.warn(`[folders] Drive delete warning for artifact ${fileId}:`, driveErr);
              }
            }
          } catch (driveError) {
            console.error("Drive delete error for document:", driveError);
          }
        }
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

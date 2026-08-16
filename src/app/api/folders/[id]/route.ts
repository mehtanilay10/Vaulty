import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { deletePrivateBlob } from "@/lib/blob";

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

    const updateData: { name?: string; parentId?: string | null } = {};

    if (name && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }

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
      updateData.parentId = parentId || null;
    }

    const updatedFolder = await prisma.folder.update({
      where: { id },
      data: updateData,
    });

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

    // Recursively collect all document blob URLs inside this folder and nested child subfolders
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

    // Find all documents in these folders to clean up Vercel Blobs
    const documentsToDelete = await prisma.document.findMany({
      where: { folderId: { in: allFolderIds } },
      select: { blobUrl: true },
    });

    for (const doc of documentsToDelete) {
      if (doc.blobUrl) {
        await deletePrivateBlob(doc.blobUrl);
      }
    }

    // Delete folder (Prisma cascading rules delete child folders & documents)
    await prisma.folder.delete({
      where: { id },
    });

    // Create Audit Log
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

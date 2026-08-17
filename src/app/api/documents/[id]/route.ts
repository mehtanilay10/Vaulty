import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess, checkFolderAccess } from "@/lib/authz";
import { deletePrivateBlob } from "@/lib/blob";
import { getProviderForDocument } from "@/lib/storage/factory";

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

    const access = await checkDocumentAccess(user.id, id);
    if (!access.hasAccess) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
        folder: {
          select: {
            id: true,
            name: true,
            parent: { select: { id: true, name: true } },
          },
        },
        tags: { include: { tag: true } },
        aiProcessing: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    return NextResponse.json({
      document,
      permission: access.permission,
      isOwner: access.isOwner,
    });
  } catch (error) {
    console.error("GET /api/documents/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch document." }, { status: 500 });
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
    const access = await checkDocumentAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Read-only users cannot modify document properties." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, folderId, tags } = body;

    const updateData: { name?: string; folderId?: string } = {};

    if (name && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }

    if (folderId && typeof folderId === "string") {
      const targetFolderAccess = await checkFolderAccess(user.id, folderId);
      if (!targetFolderAccess.isOwner) {
        return NextResponse.json(
          { error: "You can only move documents to folders you own." },
          { status: 403 }
        );
      }
      updateData.folderId = folderId;
    }

    if (Array.isArray(tags)) {
      await prisma.documentTag.deleteMany({
        where: { documentId: id },
      });

      for (const tagStr of tags) {
        if (typeof tagStr === "string" && tagStr.trim()) {
          const normalized = tagStr.trim().toLowerCase();
          const tag = await prisma.tag.upsert({
            where: { name: normalized },
            update: {},
            create: { name: normalized },
          });

          await prisma.documentTag.create({
            data: {
              documentId: id,
              tagId: tag.id,
            },
          });
        }
      }
    }

    const updatedDocument = await prisma.document.update({
      where: { id },
      data: updateData,
      include: {
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json({ document: updatedDocument });
  } catch (error) {
    console.error("PATCH /api/documents/[id] error:", error);
    return NextResponse.json({ error: "Failed to update document." }, { status: 500 });
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
    const access = await checkDocumentAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Read-only users cannot delete documents." },
        { status: 403 }
      );
    }

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, blobUrl: true, name: true, folderId: true, storageProvider: true, storageFileId: true },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    if (doc.storageProvider === "GOOGLE_DRIVE" && doc.storageFileId) {
      try {
        const { provider } = await getProviderForDocument({
          id: doc.id,
          storageProvider: doc.storageProvider,
          storageFileId: doc.storageFileId,
          ownerId: user.id,
          folderId: doc.folderId,
        });
        await provider.deleteFile(doc.storageFileId);
      } catch (driveError) {
        console.error("Google Drive delete error:", driveError);
      }
    }

    if (doc.blobUrl) {
      await deletePrivateBlob(doc.blobUrl);
    }

    await prisma.document.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        action: "DOCUMENT_DELETE",
        userId: user.id,
        documentId: id,
        folderId: doc.folderId,
        metadata: JSON.stringify({ documentName: doc.name, storageProvider: doc.storageProvider }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/documents/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete document." }, { status: 500 });
  }
}

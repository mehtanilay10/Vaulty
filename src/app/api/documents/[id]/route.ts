import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess } from "@/lib/authz";
import { getProviderForDocument } from "@/lib/storage/factory";
import { validateCSRFRequest } from "@/lib/csrf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const documentInclude = {
      owner: { select: { id: true, name: true, image: true } },
      folder: {
        select: {
          id: true,
          name: true,
          parent: { select: { id: true, name: true } },
        },
      },
      tags: { include: { tag: true } },
      aiProcessing: true,
    } as const;

    // Only update lastOpenedAt if the requester is the document owner.
    // Read-only family or shared users must not mutate the owner's document metadata or recent feed.
    let document;
    if (access.isOwner) {
      document = await prisma.document.update({
        where: { id },
        data: { lastOpenedAt: new Date() },
        include: documentInclude,
      });
    } else {
      document = await prisma.document.findUnique({
        where: { id },
        include: documentInclude,
      });
      if (!document) {
        return NextResponse.json({ error: "Document not found." }, { status: 404 });
      }
    }

    return NextResponse.json(
      {
        document,
        permission: access.permission,
        isOwner: access.isOwner,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    console.error("GET /api/documents/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch document." }, { status: 500 });
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
    const access = await checkDocumentAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Read-only users cannot modify document properties." },
        { status: 403 },
      );
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const rawName = body.name ?? body.title;
    const { folderId, tags } = body;

    const updateData: { name?: string; folderId?: string; expiryDate?: Date | null } = {};

    if (rawName && typeof rawName === "string" && rawName.trim()) {
      updateData.name = rawName.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, "expiryDate")) {
      if (body.expiryDate === null || body.expiryDate === "") {
        updateData.expiryDate = null;
      } else if (
        typeof body.expiryDate === "string" &&
        !Number.isNaN(new Date(body.expiryDate).getTime())
      ) {
        updateData.expiryDate = new Date(body.expiryDate);
      } else {
        return NextResponse.json({ error: "A valid expiry date is required." }, { status: 400 });
      }
    }

    if (folderId && typeof folderId === "string") {
      updateData.folderId = folderId;
    }

    let tagIds: string[] = [];
    if (Array.isArray(tags)) {
      const normalizedTags = Array.from(
        new Set(
          tags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        ),
      );

      if (normalizedTags.length > 0) {
        const existingTags = await prisma.tag.findMany({
          where: { name: { in: normalizedTags } },
          select: { id: true, name: true },
        });
        const existingMap = new Map(existingTags.map((t) => [t.name, t.id]));
        const missingNames = normalizedTags.filter((name) => !existingMap.has(name));

        if (missingNames.length > 0) {
          await prisma.tag.createMany({
            data: missingNames.map((name) => ({ name })),
            skipDuplicates: true,
          });
          const createdTags = await prisma.tag.findMany({
            where: { name: { in: missingNames } },
            select: { id: true, name: true },
          });
          for (const t of createdTags) {
            existingMap.set(t.name, t.id);
          }
        }

        tagIds = normalizedTags
          .map((name) => existingMap.get(name))
          .filter((tId): tId is string => Boolean(tId));
      }
    }

    const updatedDocument = await prisma.$transaction(
      async (tx) => {
        if (updateData.folderId) {
          const targetFolder = await tx.folder.findUnique({
            where: { id: updateData.folderId },
            select: { ownerId: true },
          });
          if (!targetFolder || targetFolder.ownerId !== user.id) {
            throw new Error("UNAUTHORIZED_FOLDER");
          }
        }

        if (Array.isArray(tags)) {
          await tx.documentTag.deleteMany({
            where: { documentId: id },
          });

          if (tagIds.length > 0) {
            await tx.documentTag.createMany({
              data: tagIds.map((tagId) => ({
                documentId: id,
                tagId,
              })),
              skipDuplicates: true,
            });
          }
        }

        return tx.document.update({
          where: { id },
          data: updateData,
          include: {
            tags: { include: { tag: true } },
          },
        });
      },
      { timeout: 15000, maxWait: 10000 },
    );

    return NextResponse.json({ document: updatedDocument });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED_FOLDER") {
      return NextResponse.json(
        { error: "You can only move documents to folders you own." },
        { status: 403 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    console.error("PATCH /api/documents/[id] error:", error);
    return NextResponse.json({ error: "Failed to update document." }, { status: 500 });
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
    const access = await checkDocumentAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Read-only users cannot delete documents." },
        { status: 403 },
      );
    }

    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        folderId: true,
        storageProvider: true,
        storageFileId: true,
        googleDriveSummaryFileId: true,
        googleDriveTextFileId: true,
        googleDriveInterpretationFileId: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

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
            folderId: doc.folderId,
          });

          // Delete all associated files in Google Drive concurrently
          const deleteResults = await Promise.allSettled(
            fileIdsToDelete.map(async (fileId) => {
              try {
                await provider.deleteFile(fileId);
              } catch (fileErr: unknown) {
                const errObj = fileErr as {
                  code?: number | string;
                  status?: number;
                  message?: string;
                };
                const isNotFound =
                  errObj?.code === 404 ||
                  errObj?.status === 404 ||
                  errObj?.message?.toLowerCase().includes("file not found") ||
                  errObj?.message?.toLowerCase().includes("notfound");

                if (isNotFound) {
                  console.warn(
                    `[documents] File ${fileId} was already absent from Google Drive, proceeding with deletion.`,
                  );
                  return;
                }

                if (fileId === doc.storageFileId) {
                  throw fileErr;
                }
                console.warn(`[documents] Failed to delete secondary artifact ${fileId}:`, fileErr);
              }
            }),
          );

          // If deleting the primary file threw a non-404 error, abort so file isn't orphaned
          const primaryIndex = doc.storageFileId ? fileIdsToDelete.indexOf(doc.storageFileId) : -1;
          if (primaryIndex !== -1 && deleteResults[primaryIndex]?.status === "rejected") {
            const reason = (deleteResults[primaryIndex] as PromiseRejectedResult).reason;
            throw reason;
          }
        } catch (driveError) {
          console.error("Google Drive delete error:", driveError);
          // Keep the database record so the deletion can be retried instead of
          // orphaning the file in Google Drive.
          return NextResponse.json(
            {
              error:
                "The file could not be deleted from Google Drive. The document was not removed; please try again.",
            },
            { status: 502 },
          );
        }
      }
    }

    // Use batch array transaction instead of interactive transaction callback
    // to avoid P2028 transaction expiration timeouts.
    await prisma.$transaction([
      prisma.document.delete({
        where: { id },
      }),
      // The audit log has an onDelete: Cascade relation to Document, so keep
      // the document id in metadata and leave the relation empty.
      prisma.auditLog.create({
        data: {
          action: "DOCUMENT_DELETE",
          userId: user.id,
          documentId: null,
          folderId: doc.folderId,
          metadata: JSON.stringify({
            documentId: doc.id,
            documentName: doc.name,
            storageProvider: doc.storageProvider,
          }),
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    console.error("DELETE /api/documents/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete document." }, { status: 500 });
  }
}

import { prisma } from "@/lib/prisma";
import { getProviderForDocument } from "@/lib/storage/factory";
import type { StorageProviderType } from "@/lib/storage/provider";

export interface DeletableDocument {
  id: string;
  name: string;
  folderId: string;
  storageProvider: StorageProviderType;
  storageFileId: string | null;
  googleDriveSummaryFileId: string | null;
  googleDriveTextFileId: string | null;
  googleDriveInterpretationFileId: string | null;
}

export type DeleteOutcome = "deleted" | "drive_failed";

/**
 * Deletes a document's files from the storage provider and removes the database
 * record (plus audit log). Returns "drive_failed" when the primary file could
 * not be removed from storage — in that case the DB record is kept so the
 * deletion can be retried instead of orphaning the file.
 */
export async function deleteDocumentWithStorage(opts: {
  userId: string;
  document: DeletableDocument;
}): Promise<DeleteOutcome> {
  const { userId, document: doc } = opts;

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
          ownerId: userId,
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
          throw (deleteResults[primaryIndex] as PromiseRejectedResult).reason;
        }
      } catch (driveError) {
        console.error("Google Drive delete error:", driveError);
        return "drive_failed";
      }
    }
  }

  // Batch array transaction instead of interactive transaction callback
  // to avoid P2028 transaction expiration timeouts.
  await prisma.$transaction([
    prisma.document.delete({ where: { id: doc.id } }),
    // The audit log has an onDelete: Cascade relation to Document, so keep
    // the document id in metadata and leave the relation empty.
    prisma.auditLog.create({
      data: {
        action: "DOCUMENT_DELETE",
        userId,
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

  return "deleted";
}

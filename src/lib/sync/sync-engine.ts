import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus, User } from "@prisma/client";
import { GoogleDriveStorageProvider } from "@/lib/storage/drive-provider";
import { getProviderForDocument } from "@/lib/storage/factory";

export interface SyncResult {
  success: boolean;
  documentsProcessed: number;
  foldersProcessed: number;
  conflictsDetected: number;
  errors: string[];
  newPageToken?: string;
}

export async function syncGoogleDriveForUser(userId: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    documentsProcessed: 0,
    foldersProcessed: 0,
    conflictsDetected: 0,
    errors: [],
  };

  const connection = await prisma.storageConnection.findFirst({
    where: {
      userId,
      provider: "GOOGLE_DRIVE",
    },
  });

  if (!connection || connection.status !== StorageConnectionStatus.CONNECTED) {
    result.errors.push("Google Drive not connected.");
    return result;
  }

  await prisma.storageConnection.update({
    where: { id: connection.id },
    data: { status: StorageConnectionStatus.SYNCING },
  });

  try {
    const context = {
      user: { id: userId } as User,
      connection: {
        id: connection.id,
        accessToken: connection.accessToken || undefined,
        refreshToken: connection.refreshToken || undefined,
        expiresAt: connection.expiresAt || undefined,
        rootFolderId: connection.rootFolderId || undefined,
        docsFolderId: connection.docsFolderId || undefined,
        summaryFolderId: connection.summaryFolderId || undefined,
        textFolderId: connection.textFolderId || undefined,
        pageToken: connection.pageToken || undefined,
      },
    };

    const provider = new GoogleDriveStorageProvider(context);
    const folders = await provider.listFolders(connection.docsFolderId || undefined);
    const files = await provider.listFiles(connection.docsFolderId || undefined);

    const existingFolderMappings = new Map(
      (await prisma.folder.findMany({
        where: { ownerId: userId },
        select: { id: true, storageFolderId: true, storageProvider: true },
      })).filter((f) => f.storageFolderId).map((f) => [f.storageFolderId!, f.id])
    );

    const existingFileMappings = new Map(
      (await prisma.document.findMany({
        where: { ownerId: userId, storageProvider: "GOOGLE_DRIVE" },
        select: { id: true, storageFileId: true, storageProvider: true },
      })).filter((d) => d.storageFileId).map((d) => [d.storageFileId!, d.id])
    );

    for (const driveFolder of folders) {
      if (existingFolderMappings.has(driveFolder.id)) {
        const vaultyFolderId = existingFolderMappings.get(driveFolder.id)!;
        const vaultyFolder = await prisma.folder.findUnique({
          where: { id: vaultyFolderId },
        });

        if (vaultyFolder && vaultyFolder.name !== driveFolder.name) {
          await prisma.folder.update({
            where: { id: vaultyFolderId },
            data: { name: driveFolder.name, updatedAt: new Date() },
          });

          await prisma.syncEvent.create({
            data: {
              userId,
              provider: "GOOGLE_DRIVE",
              folderId: vaultyFolderId,
              operation: "RENAME",
              status: "SUCCESS",
              metadata: JSON.stringify({ driveFolderId: driveFolder.id, newName: driveFolder.name }),
              completedAt: new Date(),
            },
          });
        }
      } else {
        const vaultyFolder = await prisma.folder.create({
          data: {
            name: driveFolder.name,
            ownerId: userId,
            parentId: null,
            storageProvider: "GOOGLE_DRIVE",
            storageFolderId: driveFolder.id,
          },
        });

        await prisma.syncEvent.create({
          data: {
            userId,
            provider: "GOOGLE_DRIVE",
            folderId: vaultyFolder.id,
            operation: "IMPORT",
            status: "SUCCESS",
            metadata: JSON.stringify({ driveFolderId: driveFolder.id, name: driveFolder.name }),
            completedAt: new Date(),
          },
        });

        result.foldersProcessed++;
      }
    }

    for (const driveFile of files) {
      if (existingFileMappings.has(driveFile.id)) {
        const vaultyDocId = existingFileMappings.get(driveFile.id)!;
        const doc = await prisma.document.findUnique({
          where: { id: vaultyDocId },
        });

        if (doc && doc.storageStatus === "CONFLICT") {
          continue;
        }

        if (doc && doc.storageModifiedAt && new Date(doc.storageModifiedAt) >= driveFile.modifiedAt) {
          continue;
        }

        if (doc && doc.storageChecksum && doc.storageChecksum === driveFile.checksum) {
          continue;
        }

        const vaultyModified = doc?.updatedAt || new Date(0);
        const driveModified = driveFile.modifiedAt;

        if (vaultyModified > driveModified && doc?.storageModifiedAt && new Date(doc.storageModifiedAt) < vaultyModified) {
          await prisma.document.update({
            where: { id: vaultyDocId },
            data: { storageStatus: "CONFLICT" },
          });

          await prisma.syncEvent.create({
            data: {
              userId,
              provider: "GOOGLE_DRIVE",
              documentId: vaultyDocId,
              operation: "CONFLICT",
              status: "SUCCESS",
              metadata: JSON.stringify({
                driveFileId: driveFile.id,
                vaultyModified: vaultyModified.toISOString(),
                driveModified: driveModified.toISOString(),
              }),
              completedAt: new Date(),
            },
          });

          result.conflictsDetected++;
          continue;
        }

        await prisma.document.update({
          where: { id: vaultyDocId },
          data: {
            name: driveFile.name,
            storageFileId: driveFile.id,
            storageParentId: driveFile.parentId,
            storageModifiedAt: driveFile.modifiedAt,
            storageChecksum: driveFile.checksum || null,
            storageVersion: driveFile.version,
            storageWebViewLink: driveFile.webViewLink || null,
            storageStatus: "ACTIVE",
          },
        });

        await prisma.syncEvent.create({
          data: {
            userId,
            provider: "GOOGLE_DRIVE",
            documentId: vaultyDocId,
            operation: "UPDATE",
            status: "SUCCESS",
            metadata: JSON.stringify({ driveFileId: driveFile.id, name: driveFile.name }),
            completedAt: new Date(),
          },
        });

        result.documentsProcessed++;
      } else {
        const parentDriveId = driveFile.parentId;
        const folderMatch = Array.from(existingFolderMappings.entries()).find(
          ([mappedDriveId]) => {
            const f = folders.find((df) => df.id === parentDriveId);
            return f && existingFolderMappings.has(f.id);
          }
        );

        const targetFolderId = folderMatch ? folderMatch[1] : null;

        if (!targetFolderId) {
          continue;
        }

        const vaultyDoc = await prisma.document.create({
          data: {
            name: driveFile.name,
            mimeType: driveFile.mimeType,
            sizeBytes: driveFile.sizeBytes,
            folderId: targetFolderId,
            ownerId: userId,
            storageProvider: "GOOGLE_DRIVE",
            storageFileId: driveFile.id,
            storageParentId: driveFile.parentId,
            storageModifiedAt: driveFile.modifiedAt,
            storageChecksum: driveFile.checksum || null,
            storageVersion: driveFile.version,
            storageWebViewLink: driveFile.webViewLink || null,
            storageStatus: "ACTIVE",
          },
        });

        await prisma.syncEvent.create({
          data: {
            userId,
            provider: "GOOGLE_DRIVE",
            documentId: vaultyDoc.id,
            operation: "IMPORT",
            status: "SUCCESS",
            metadata: JSON.stringify({ driveFileId: driveFile.id, name: driveFile.name }),
            completedAt: new Date(),
          },
        });

        result.documentsProcessed++;
      }
    }

    await prisma.storageConnection.update({
      where: { id: connection.id },
      data: {
        status: StorageConnectionStatus.CONNECTED,
        lastSyncedAt: new Date(),
      },
    });

    result.success = true;
    return result;
  } catch (error) {
    console.error("Sync error:", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown sync error");

    await prisma.storageConnection.update({
      where: { id: connection.id },
      data: { status: StorageConnectionStatus.FAILED },
    });

    return result;
  }
}

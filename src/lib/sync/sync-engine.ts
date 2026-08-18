import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus, User } from "@prisma/client";
import { GoogleDriveStorageProvider } from "@/lib/storage/drive-provider";
import { getProviderForDocument } from "@/lib/storage/factory";
import { StorageFile, StorageFolder } from "@/lib/storage/provider";

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
        interpretationFolderId: connection.interpretationFolderId || undefined,
        pageToken: connection.pageToken || undefined,
      },
    };

    const provider = new GoogleDriveStorageProvider(context);
    const docsFolderId = connection.docsFolderId ?? undefined;

    if (!docsFolderId) {
      result.errors.push("Docs folder ID not configured.");
      return result;
    }

    async function discoverDriveFolders(parentId: string | undefined): Promise<StorageFolder[]> {
      const folders = await provider.listFolders(parentId);
      let collected = [...folders];
      for (const folder of folders) {
        const children = await discoverDriveFolders(folder.id);
        collected.push(...children);
      }
      return collected;
    }

    async function discoverDriveFiles(parentId: string | undefined): Promise<StorageFile[]> {
      const files = await provider.listFiles(parentId);
      const subfolders = await provider.listFolders(parentId);
      let collected = [...files];
      for (const folder of subfolders) {
        const nested = await discoverDriveFiles(folder.id);
        collected.push(...nested);
      }
      return collected;
    }

    const allDriveFolders = await discoverDriveFolders(docsFolderId);
    const allDriveFiles = await discoverDriveFiles(docsFolderId);

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

    for (const driveFolder of allDriveFolders) {
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
        const parentDriveId = driveFolder.parentId || null;
        const targetParentId = parentDriveId
          ? existingFolderMappings.get(parentDriveId) || null
          : null;

        const vaultyFolder = await prisma.folder.create({
          data: {
            name: driveFolder.name,
            ownerId: userId,
            parentId: targetParentId,
            storageProvider: "GOOGLE_DRIVE",
            storageFolderId: driveFolder.id,
          },
        });

        existingFolderMappings.set(driveFolder.id, vaultyFolder.id);

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

    for (const driveFile of allDriveFiles) {
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

        if (doc && doc.storageChecksum && doc.storageChecksum === driveFile.checksum && doc.name === driveFile.name) {
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

        if (!parentDriveId) {
          continue;
        }

        let targetFolderId = existingFolderMappings.get(parentDriveId);

        if (!targetFolderId && parentDriveId === docsFolderId) {
          const rootFolder = await prisma.folder.findFirst({
            where: { ownerId: userId, parentId: null },
          });

          if (rootFolder) {
            targetFolderId = rootFolder.id;
          } else {
            const newRoot = await prisma.folder.create({
              data: {
                name: "Vaulty Docs",
                ownerId: userId,
                parentId: null,
              },
            });
            targetFolderId = newRoot.id;
          }
        }

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

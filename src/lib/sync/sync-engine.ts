import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus, User } from "@prisma/client";
import { GoogleDriveStorageProvider } from "@/lib/storage/drive-provider";
import { getProviderForDocument, getProviderForUser } from "@/lib/storage/factory";
import { StorageFile, StorageFolder } from "@/lib/storage/provider";
import { processDocumentWithGemini, GEMINI_MODEL } from "@/lib/gemini";
import { decryptDriveRefreshToken } from "@/lib/google-drive/oauth";

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
    // Check if token needs refresh before sync
    const tokenExpiryGraceMs = 5 * 60 * 1000;
    let accessToken = connection.accessToken;
    let expiresAt = connection.expiresAt;

    if (!accessToken) {
      result.errors.push("No access token available.");
      return result;
    }

    if (expiresAt && expiresAt.getTime() - Date.now() < tokenExpiryGraceMs) {
      if (!connection.refreshToken) {
        await prisma.storageConnection.update({
          where: { id: connection.id },
          data: { status: StorageConnectionStatus.RECONNECT_REQUIRED },
        });
        result.errors.push("Access token expired and no refresh token available.");
        return result;
      }

      // Refresh the token
      try {
        const { google } = await import("googleapis");
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          throw new Error("Google OAuth credentials not configured.");
        }

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({
          refresh_token: decryptDriveRefreshToken(connection.refreshToken),
        });
        const { credentials } = await oauth2Client.refreshAccessToken();

        accessToken = credentials.access_token || connection.accessToken;
        const newExpiresIn = credentials.expiry_date
          ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
          : 3600;
        expiresAt = new Date(Date.now() + newExpiresIn * 1000);

        // Update connection with refreshed token
        await prisma.storageConnection.update({
          where: { id: connection.id },
          data: {
            accessToken,
            expiresAt,
            status: StorageConnectionStatus.CONNECTED,
          },
        });
      } catch (refreshError) {
        console.error("Failed to refresh Google Drive token:", refreshError);
        await prisma.storageConnection.update({
          where: { id: connection.id },
          data: { status: StorageConnectionStatus.RECONNECT_REQUIRED },
        });
        result.errors.push("Failed to refresh access token. Please reconnect Google Drive.");
        return result;
      }
    }

    const context = {
      user: { id: userId } as User,
      connection: {
        id: connection.id,
        accessToken: accessToken || undefined,
        refreshToken: connection.refreshToken || undefined,
        expiresAt: expiresAt || undefined,
        rootFolderId: connection.rootFolderId || undefined,
        docsFolderId: connection.docsFolderId || undefined,
        summaryFolderId: connection.summaryFolderId || undefined,
        textFolderId: connection.textFolderId || undefined,
        interpretationFolderId: connection.interpretationFolderId || undefined,
        pageToken: connection.pageToken || undefined,
      },
    };

    const provider = new GoogleDriveStorageProvider(context);
    const docsFolderId = connection.docsFolderId;

    if (!docsFolderId) {
      result.errors.push("Docs folder ID not configured.");
      return result;
    }

    async function discoverDriveFolders(parentId: string): Promise<StorageFolder[]> {
      const MAX_DEPTH = 50;
      const collected: StorageFolder[] = [];
      const queue: { id: string; depth: number }[] = [{ id: parentId, depth: 0 }];

      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const { id, depth } = item;
        if (depth >= MAX_DEPTH) {
          console.warn(
            `[Sync Debug] Reached maximum folder depth (${MAX_DEPTH}), skipping further discovery.`,
          );
          continue;
        }

        const folders = await provider.listFolders(id);
        collected.push(...folders);

        for (const folder of folders) {
          queue.push({ id: folder.id, depth: depth + 1 });
        }
      }

      return collected;
    }

    async function discoverDriveFiles(parentId: string): Promise<StorageFile[]> {
      const MAX_DEPTH = 50;
      const collected: StorageFile[] = [];
      const queue: { id: string; depth: number }[] = [{ id: parentId, depth: 0 }];

      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const { id, depth } = item;
        if (depth >= MAX_DEPTH) {
          console.warn(
            `[Sync Debug] Reached maximum folder depth (${MAX_DEPTH}), skipping further discovery.`,
          );
          continue;
        }

        const files = await provider.listFiles(id);
        const subfolders = await provider.listFolders(id);
        collected.push(...files);

        for (const folder of subfolders) {
          queue.push({ id: folder.id, depth: depth + 1 });
        }
      }

      return collected;
    }

    const allDriveFolders = await discoverDriveFolders(docsFolderId);
    const allDriveFiles = await discoverDriveFiles(docsFolderId);

    const existingFolderMappings = new Map(
      (
        await prisma.folder.findMany({
          where: { ownerId: userId },
          select: { id: true, storageFolderId: true, storageProvider: true },
        })
      )
        .filter((f): f is typeof f & { storageFolderId: string } => Boolean(f.storageFolderId))
        .map((f) => [f.storageFolderId, f.id]),
    );

    const existingFileMappings = new Map(
      (
        await prisma.document.findMany({
          where: { ownerId: userId, storageProvider: "GOOGLE_DRIVE" },
          select: { id: true, storageFileId: true, storageProvider: true },
        })
      )
        .filter((d): d is typeof d & { storageFileId: string } => Boolean(d.storageFileId))
        .map((d) => [d.storageFileId, d.id]),
    );

    console.error("[Sync Debug] docsFolderId:", docsFolderId);
    console.error(
      "[Sync Debug] discovered folders:",
      allDriveFolders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
    );
    console.error(
      "[Sync Debug] discovered files:",
      allDriveFiles.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
    );
    console.error(
      "[Sync Debug] existingFolderMappings:",
      Array.from(existingFolderMappings.entries()),
    );
    console.error("[Sync Debug] existingFileMappings count:", existingFileMappings.size);

    for (const driveFolder of allDriveFolders) {
      console.error(
        "[Sync Debug] processing folder:",
        driveFolder.id,
        driveFolder.name,
        "parentId:",
        driveFolder.parentId,
      );
      const vaultyFolderId = existingFolderMappings.get(driveFolder.id);
      if (vaultyFolderId) {
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
              metadata: JSON.stringify({
                driveFolderId: driveFolder.id,
                newName: driveFolder.name,
              }),
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
        console.error(
          "[Sync Debug] imported new folder:",
          driveFolder.id,
          driveFolder.name,
          "targetParentId:",
          targetParentId,
        );
      }
    }

    for (const driveFile of allDriveFiles) {
      console.error(
        "[Sync Debug] processing file:",
        driveFile.id,
        driveFile.name,
        "parent:",
        driveFile.parentId,
      );
      const vaultyDocId = existingFileMappings.get(driveFile.id);
      if (vaultyDocId) {
        const doc = await prisma.document.findUnique({
          where: { id: vaultyDocId },
        });

        console.error(
          "[Sync Debug] existing file check:",
          driveFile.id,
          "status:",
          doc?.storageStatus,
          "storageModifiedAt:",
          doc?.storageModifiedAt,
          "driveModifiedAt:",
          driveFile.modifiedAt,
          "checksumMatch:",
          doc?.storageChecksum === driveFile.checksum,
          "nameMatch:",
          doc?.name === driveFile.name,
        );

        if (doc && doc.storageStatus === "CONFLICT") {
          console.error("[Sync Debug] skipping due to CONFLICT status");
          continue;
        }

        if (
          doc &&
          doc.storageModifiedAt &&
          new Date(doc.storageModifiedAt) >= driveFile.modifiedAt
        ) {
          console.error("[Sync Debug] skipping due to storageModifiedAt >= driveModifiedAt");
          continue;
        }

        if (
          doc &&
          doc.storageChecksum &&
          doc.storageChecksum === driveFile.checksum &&
          doc.name === driveFile.name
        ) {
          console.error("[Sync Debug] skipping due to checksum+name match");
          continue;
        }

        const vaultyModified = doc?.updatedAt || new Date(0);
        const driveModified = driveFile.modifiedAt;

        if (
          vaultyModified > driveModified &&
          doc?.storageModifiedAt &&
          new Date(doc.storageModifiedAt) < vaultyModified
        ) {
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
        console.error("[Sync Debug] updated existing file:", driveFile.id);
      } else {
        const parentDriveId = driveFile.parentId;

        if (!parentDriveId) {
          console.error("[Sync Debug] skipping file (no parent):", driveFile.id, driveFile.name);
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
          console.error(
            "[Sync Debug] skipping file (no target folder):",
            driveFile.id,
            driveFile.name,
            "parentDriveId:",
            parentDriveId,
          );
          continue;
        }

        console.error(
          "[Sync Debug] importing new file:",
          driveFile.id,
          driveFile.name,
          "targetFolderId:",
          targetFolderId,
        );

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

        // Process AI synchronously to avoid unhandled errors and resource leaks
        try {
          const aiRecord = await prisma.aiProcessing.create({
            data: {
              documentId: vaultyDoc.id,
              status: "QUEUED",
              modelUsed: GEMINI_MODEL,
            },
          });

          await prisma.aiProcessing.update({
            where: { id: aiRecord.id },
            data: { status: "PROCESSING" },
          });

          let fileBuffer: Buffer;
          if (vaultyDoc.storageProvider === "GOOGLE_DRIVE" && driveFile.id) {
            const { provider } = await getProviderForDocument({
              id: vaultyDoc.id,
              storageProvider: vaultyDoc.storageProvider,
              storageFileId: driveFile.id,
              ownerId: userId,
              folderId: targetFolderId,
            });
            fileBuffer = await provider.downloadFile(driveFile.id);
          } else {
            throw new Error("Unsupported storage provider for AI processing.");
          }

          const geminiResult = await processDocumentWithGemini(
            fileBuffer,
            driveFile.mimeType,
            driveFile.name,
          );

          let textFileId: string | null = null;
          let summaryFileId: string | null = null;
          let interpretationFileId: string | null = null;

          try {
            const { provider } = await getProviderForUser(userId, "GOOGLE_DRIVE");
            const vaultyFolders = await provider.ensureVaultyFolders();
            const baseName = driveFile.name.replace(/[/\\?%*:|"<>]/g, "_");

            const textUpload = await provider.uploadFile({
              filename: `${baseName}.txt`,
              mimeType: "text/plain",
              data: Buffer.from(geminiResult.extractedText),
              parentId: vaultyFolders.text,
            });
            textFileId = textUpload.id;

            const summaryUpload = await provider.uploadFile({
              filename: `${baseName}.md`,
              mimeType: "text/markdown",
              data: Buffer.from(geminiResult.summaryMarkdown),
              parentId: vaultyFolders.summary,
            });
            summaryFileId = summaryUpload.id;

            const interpretationUpload = await provider.uploadFile({
              filename: `${baseName}.md`,
              mimeType: "text/markdown",
              data: Buffer.from(geminiResult.interpretationMarkdown),
              parentId: vaultyFolders.interpretation,
            });
            interpretationFileId = interpretationUpload.id;
          } catch (driveAiErr) {
            console.error("Failed to upload AI files to Google Drive:", driveAiErr);
          }

          await prisma.aiProcessing.update({
            where: { id: aiRecord.id },
            data: {
              status: "COMPLETED",
              extractedText: geminiResult.extractedText,
              summaryMarkdown: geminiResult.summaryMarkdown,
              interpretationMarkdown: geminiResult.interpretationMarkdown,
              processedAt: new Date(),
              errorMessage: null,
            },
          });

          if (textFileId || summaryFileId || interpretationFileId) {
            await prisma.document.update({
              where: { id: vaultyDoc.id },
              data: {
                googleDriveSummaryFileId: summaryFileId,
                googleDriveTextFileId: textFileId,
                googleDriveInterpretationFileId: interpretationFileId,
              },
            });
          }
        } catch (aiErr: unknown) {
          const e = aiErr as { message?: string };
          console.error("Gemini AI sync processing error:", aiErr);
          await prisma.aiProcessing.create({
            data: {
              documentId: vaultyDoc.id,
              status: "FAILED",
              errorMessage: e?.message || "AI processing failed.",
            },
          });
        }
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

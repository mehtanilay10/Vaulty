import { StorageProvider, StorageProviderContext } from "./provider";
import type { StorageProviderType } from "./provider";
import { GoogleDriveStorageProvider } from "./drive-provider";
import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";

export function createProvider(
  type: StorageProviderType,
  context: StorageProviderContext,
): StorageProvider {
  switch (type) {
    case "GOOGLE_DRIVE":
      return new GoogleDriveStorageProvider(context);
    default:
      throw new Error(
        `Unsupported storage provider type: "${type}". Only GOOGLE_DRIVE is supported.`,
      );
  }
}

export async function getProviderForUser(
  userId: string,
  providerType?: StorageProviderType,
): Promise<{ provider: StorageProvider; context: StorageProviderContext }> {
  const [user, connection] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
    }),
    prisma.storageConnection.findFirst({
      where: {
        userId,
        provider: "GOOGLE_DRIVE",
        status: StorageConnectionStatus.CONNECTED,
      },
    }),
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  const type = providerType || user.defaultStorageProvider || "GOOGLE_DRIVE";

  if (type === "GOOGLE_DRIVE") {
    if (!connection) {
      throw new Error("Google Drive is not connected.");
    }

    const context: StorageProviderContext = {
      user,
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

    return { provider: createProvider("GOOGLE_DRIVE", context), context };
  }

  throw new Error(`Unsupported storage provider type: "${type}". Only GOOGLE_DRIVE is supported.`);
}

export async function getProviderForDocument(document: {
  id: string;
  storageProvider: StorageProviderType;
  storageFileId?: string | null;
  ownerId: string;
  folderId: string;
}): Promise<{ provider: StorageProvider; context: StorageProviderContext }> {
  if (document.storageProvider === "GOOGLE_DRIVE") {
    const [connection, user] = await Promise.all([
      prisma.storageConnection.findFirst({
        where: {
          userId: document.ownerId,
          provider: "GOOGLE_DRIVE",
          status: StorageConnectionStatus.CONNECTED,
        },
      }),
      prisma.user.findUnique({
        where: { id: document.ownerId },
      }),
    ]);

    if (!connection) {
      throw new Error("Google Drive connection not available.");
    }

    if (!user) {
      throw new Error("User not found.");
    }

    const context: StorageProviderContext = {
      user,
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

    return { provider: createProvider("GOOGLE_DRIVE", context), context };
  }

  throw new Error("Google Drive connection not available.");
}

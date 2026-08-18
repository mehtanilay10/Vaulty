import { StorageProvider, StorageProviderContext } from "./provider";
import type { StorageProviderType } from "./provider";
import { VercelBlobStorageProvider } from "./blob-provider";
import { GoogleDriveStorageProvider } from "./drive-provider";
import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";

export function createProvider(
  type: StorageProviderType,
  context: StorageProviderContext
): StorageProvider {
  switch (type) {
    case "GOOGLE_DRIVE":
      return new GoogleDriveStorageProvider(context);
    case "VERCEL_BLOB":
      return new VercelBlobStorageProvider();
    default:
      return new VercelBlobStorageProvider();
  }
}

export async function getProviderForUser(userId: string, providerType?: StorageProviderType): Promise<{ provider: StorageProvider; context: StorageProviderContext }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      storageConnections: true,
    },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const type = providerType || user.defaultStorageProvider || "VERCEL_BLOB";

  if (type === "GOOGLE_DRIVE") {
    const connection = user.storageConnections.find(
      (c) => c.provider === "GOOGLE_DRIVE" && c.status === StorageConnectionStatus.CONNECTED
    );

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

  return { provider: createProvider("VERCEL_BLOB", { user }), context: { user } };
}

export async function getProviderForDocument(document: {
  id: string;
  storageProvider: StorageProviderType;
  storageFileId?: string | null;
  ownerId: string;
  folderId: string;
}): Promise<{ provider: StorageProvider; context: StorageProviderContext }> {
  if (document.storageProvider === "GOOGLE_DRIVE") {
    const connection = await prisma.storageConnection.findFirst({
      where: {
        userId: document.ownerId,
        provider: "GOOGLE_DRIVE",
        status: StorageConnectionStatus.CONNECTED,
      },
    });

    if (!connection) {
      throw new Error("Google Drive connection not available.");
    }

    const user = await prisma.user.findUnique({
      where: { id: document.ownerId },
    });

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

  const user = await prisma.user.findUnique({
    where: { id: document.ownerId },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  return { provider: createProvider("VERCEL_BLOB", { user }), context: { user } };
}

import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { Readable } from "stream";
import { decryptDriveRefreshToken } from "@/lib/google-drive/oauth";
import {
  StorageProvider,
  StorageProviderContext,
  UploadOptions,
  UploadResult,
  StorageFile,
  StorageFolder,
} from "./provider";

// Lock map to prevent duplicate concurrent refresh requests for the same connection
const activeTokenRefreshes = new Map<string, Promise<string>>();

export class GoogleDriveStorageProvider implements StorageProvider {
  readonly type = "GOOGLE_DRIVE" as const;
  private context: StorageProviderContext;
  private tokenExpiryGraceMs = 5 * 60 * 1000;
  private folderCache = new Map<string, Map<string, string>>();
  private folderCacheTimestamps = new Map<string, number>();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(context: StorageProviderContext) {
    this.context = context;
  }

  private evictExpiredCacheEntries(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.folderCacheTimestamps.entries()) {
      if (now - timestamp > this.CACHE_TTL_MS) {
        this.folderCache.delete(key);
        this.folderCacheTimestamps.delete(key);
      }
    }
  }

  private enforceCacheSizeLimit(): void {
    if (this.folderCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.folderCacheTimestamps.entries()).sort((a, b) => a[1] - b[1]); // Oldest first

      const toRemove = this.folderCache.size - this.MAX_CACHE_SIZE;
      for (let i = 0; i < toRemove; i++) {
        const [key] = entries[i];
        this.folderCache.delete(key);
        this.folderCacheTimestamps.delete(key);
      }
    }
  }

  private createOAuth2Client() {
    const connection = this.context.connection;
    if (!connection?.accessToken) {
      throw new Error("Google Drive not connected.");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials not configured.");
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

    const decryptedRefreshToken = connection.refreshToken
      ? decryptDriveRefreshToken(connection.refreshToken)
      : undefined;

    const credentials: Record<string, unknown> = {
      access_token: connection.accessToken,
      refresh_token: decryptedRefreshToken,
    };

    if (connection.expiresAt) {
      credentials.expiry_date = connection.expiresAt.getTime();
    }

    oauth2Client.setCredentials(credentials);
    return oauth2Client;
  }

  private async getDrive() {
    await this.ensureValidToken();
    const oauth2Client = this.createOAuth2Client();
    return google.drive({ version: "v3", auth: oauth2Client });
  }

  private async toStream(data: Buffer | Blob): Promise<Readable> {
    if (Buffer.isBuffer(data)) {
      return Readable.from(data);
    }
    if (data instanceof Uint8Array) {
      return Readable.from(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    }
    if (data instanceof ArrayBuffer) {
      return Readable.from(Buffer.from(data));
    }
    const streamData = data as unknown as { stream?: () => unknown };
    const readableWithWeb = Readable as unknown as { fromWeb?: (stream: unknown) => Readable };
    if (typeof streamData?.stream === "function" && typeof readableWithWeb.fromWeb === "function") {
      try {
        return readableWithWeb.fromWeb((data as Blob).stream());
      } catch {
        // Fallback to arrayBuffer below
      }
    }
    if (typeof (data as Blob)?.arrayBuffer === "function") {
      const ab = await (data as Blob).arrayBuffer();
      return Readable.from(Buffer.from(ab));
    }
    return Readable.from(Buffer.from(data as unknown as Uint8Array | string));
  }

  private async ensureValidToken(): Promise<string> {
    const connection = this.context.connection;
    if (!connection?.accessToken) {
      throw new Error("Google Drive not connected.");
    }

    if (
      connection.expiresAt &&
      connection.expiresAt.getTime() - Date.now() < this.tokenExpiryGraceMs
    ) {
      if (!connection.refreshToken) {
        throw new Error("Access token expired and no refresh token available.");
      }
      return this.refreshAccessToken(connection.refreshToken);
    }

    return connection.accessToken;
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const lockKey = this.context.connection?.id || refreshToken;
    const existingRefresh = activeTokenRefreshes.get(lockKey);
    if (existingRefresh) {
      return existingRefresh;
    }

    const refreshPromise = (async () => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error("Google OAuth credentials not configured.");
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: decryptDriveRefreshToken(refreshToken) });

      let lastError: unknown;
      const maxRetries = 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          const accessToken = credentials.access_token || "";
          const expiresIn = credentials.expiry_date
            ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
            : undefined;
          const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

          // Update in-memory context
          this.context = {
            ...this.context,
            connection: this.context.connection
              ? {
                  ...this.context.connection,
                  accessToken,
                  expiresAt,
                }
              : undefined,
          };

          // Persist to database for future requests
          if (this.context.connection?.id) {
            try {
              const { prisma } = await import("@/lib/prisma");
              await prisma.storageConnection.update({
                where: { id: this.context.connection.id },
                data: {
                  accessToken,
                  expiresAt,
                  status: "CONNECTED",
                },
              });
            } catch (error) {
              console.error("Failed to persist refreshed token:", error);
            }
          }

          return accessToken;
        } catch (error: unknown) {
          lastError = error;
          const errorRecord = error as {
            message?: string;
            response?: { data?: { error?: string } };
            status?: number;
            code?: number;
          } | null;
          const errorMsg = errorRecord?.message || String(error);
          const isInvalidGrant =
            errorMsg.includes("invalid_grant") ||
            errorRecord?.response?.data?.error === "invalid_grant" ||
            errorRecord?.status === 400 ||
            errorRecord?.code === 400;

          // If token revoked or expired permanently at Google, don't retry
          if (isInvalidGrant) {
            break;
          }

          // For transient network / 5xx errors, wait with exponential backoff before retrying
          if (attempt < maxRetries - 1) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 4000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
          }
        }
      }

      // Permanent failure or retries exhausted
      console.error("Failed to refresh Google Drive access token:", lastError);
      if (this.context.connection?.id) {
        try {
          const { prisma } = await import("@/lib/prisma");
          await prisma.storageConnection.update({
            where: { id: this.context.connection.id },
            data: {
              status: "DISCONNECTED",
            },
          });

          const userId = this.context.user?.id;
          if (userId) {
            const { createNotification } = await import("@/lib/notifications");
            await createNotification({
              userId,
              type: "GOOGLE_DRIVE_DISCONNECTED",
              title: "Google Drive Disconnected",
              message:
                "Your Google Drive connection expired or was revoked. Please reconnect in Settings.",
              actionUrl: "/settings?tab=drive",
              idempotencyKey: `drive_disconnect_${this.context.connection.id}_${new Date().toISOString().slice(0, 10)}`,
            });
          }
        } catch (dbError) {
          console.error("Failed to update connection status or send notification:", dbError);
        }
      }

      throw new Error(
        "Failed to refresh access token. Please reconnect your Google Drive account in Settings.",
      );
    })().finally(() => {
      activeTokenRefreshes.delete(lockKey);
    });

    activeTokenRefreshes.set(lockKey, refreshPromise);
    return refreshPromise;
  }

  async createFolder(name: string, parentId?: string): Promise<StorageFolder> {
    const drive = await this.getDrive();
    const folderMetadata: Record<string, unknown> = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) (folderMetadata as { parents: string[] }).parents = [parentId];

    const folder = await drive.files.create({
      requestBody: {
        ...folderMetadata,
      } as drive_v3.Schema$File,
      fields: "id,name,modifiedTime,parents",
    });

    return this.mapDriveFolder(folder.data);
  }

  async renameFolder(folderId: string, newName: string): Promise<StorageFolder> {
    const drive = await this.getDrive();
    const folder = await drive.files.update({
      fileId: folderId,
      requestBody: {
        name: newName,
      } as drive_v3.Schema$File,
      fields: "id,name,modifiedTime,parents",
    });

    return this.mapDriveFolder(folder.data);
  }

  async moveFolder(folderId: string, newParentId: string | null): Promise<StorageFolder> {
    const drive = await this.getDrive();

    let oldParentId: string | undefined;
    if (newParentId) {
      try {
        const file = await drive.files.get({
          fileId: folderId,
          fields: "parents",
        });
        oldParentId = file?.data?.parents?.[0];
      } catch {
        // proceed without removing old parent
      }
    }

    const folder = await drive.files.update({
      fileId: folderId,
      requestBody: {},
      addParents: newParentId || undefined,
      removeParents: newParentId ? oldParentId : undefined,
      fields: "id,name,modifiedTime,parents",
    });

    return this.mapDriveFolder(folder.data);
  }

  async deleteFolder(folderId: string): Promise<void> {
    const drive = await this.getDrive();
    await drive.files.delete({ fileId: folderId });
  }

  async listFolders(parentId?: string): Promise<StorageFolder[]> {
    const drive = await this.getDrive();
    const parent = parentId || "root";
    const query = `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const files = await drive.files.list({
      q: query,
      fields: "files(id,name,modifiedTime,parents)",
      pageSize: 1000,
    });

    return (files.data.files || []).map(this.mapDriveFolder);
  }

  async uploadFile(options: UploadOptions): Promise<UploadResult> {
    const drive = await this.getDrive();
    const parentId = options.parentId || "root";
    const contentType = options.mimeType || "application/octet-stream";

    const res = await drive.files.create({
      requestBody: {
        name: options.filename,
        mimeType: contentType,
        parents: [parentId],
      } as drive_v3.Schema$File,
      media: {
        mimeType: contentType,
        body: await this.toStream(options.data),
      },
      fields: "id,name,size,modifiedTime,md5Checksum,version,webViewLink,parents",
    });

    return this.mapDriveFile(res.data);
  }

  async uploadFileResumable(options: UploadOptions, parentId?: string): Promise<UploadResult> {
    const drive = await this.getDrive();
    const targetParentId = parentId || options.parentId || "root";
    const contentType = options.mimeType || "application/octet-stream";

    const res = await drive.files.create({
      requestBody: {
        name: options.filename,
        mimeType: contentType,
        parents: [targetParentId],
      } as drive_v3.Schema$File,
      media: {
        mimeType: contentType,
        body: await this.toStream(options.data),
      },
      fields: "id,name,size,modifiedTime,md5Checksum,version,webViewLink,parents",
    });

    return this.mapDriveFile(res.data);
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const drive = await this.getDrive();
    const res = await drive.files.get(
      {
        fileId,
        alt: "media",
      },
      { responseType: "arraybuffer" },
    );

    return Buffer.from(res.data as ArrayBuffer);
  }

  async downloadFileStream(fileId: string): Promise<ReadableStream<Uint8Array>> {
    const drive = await this.getDrive();
    const res = await drive.files.get(
      {
        fileId,
        alt: "media",
      },
      { responseType: "stream" },
    );

    return Readable.toWeb(res.data as Readable) as ReadableStream<Uint8Array>;
  }

  async getFile(fileId: string): Promise<StorageFile | null> {
    const drive = await this.getDrive();
    try {
      const file = await drive.files.get({
        fileId,
        fields: "id,name,mimeType,size,modifiedTime,md5Checksum,version,webViewLink,parents",
      });
      if (!file.data || file.data.id !== fileId) return null;
      return this.mapDriveFile(file.data);
    } catch {
      return null;
    }
  }

  async updateFile(
    fileId: string,
    options: { name?: string; parentId?: string },
  ): Promise<StorageFile> {
    const drive = await this.getDrive();
    const body: drive_v3.Schema$File = {};

    if (options.name) body.name = options.name;

    const file = await drive.files.update({
      fileId,
      requestBody: body,
      addParents: options.parentId || undefined,
      fields: "id,name,mimeType,size,modifiedTime,md5Checksum,version,webViewLink,parents",
    });

    return this.mapDriveFile(file.data);
  }

  async updateFileContent(
    fileId: string,
    options: {
      data: Buffer | Blob | Uint8Array;
      mimeType: string;
      filename?: string;
    },
  ): Promise<StorageFile> {
    const drive = await this.getDrive();
    const body: drive_v3.Schema$File = {};
    if (options.filename) body.name = options.filename;

    const file = await drive.files.update({
      fileId,
      requestBody: body,
      media: {
        mimeType: options.mimeType,
        body: await this.toStream(options.data as Buffer | Blob),
      },
      fields: "id,name,mimeType,size,modifiedTime,md5Checksum,version,webViewLink,parents",
    });

    return this.mapDriveFile(file.data);
  }

  async deleteFile(fileId: string): Promise<void> {
    const drive = await this.getDrive();
    await drive.files.delete({ fileId });
  }

  async listFiles(parentId?: string): Promise<StorageFile[]> {
    const drive = await this.getDrive();
    const parent = parentId || "root";
    const query = `'${parent}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`;
    const files = await drive.files.list({
      q: query,
      fields: "files(id,name,mimeType,size,modifiedTime,md5Checksum,version,webViewLink,parents)",
      pageSize: 1000,
    });

    return (files.data.files || []).map(this.mapDriveFile);
  }

  async getRootFolderStructure(): Promise<{
    docs: string;
    summary: string;
    interpretation: string;
    text: string;
  }> {
    return {
      docs: this.context.connection?.docsFolderId || "",
      summary: this.context.connection?.summaryFolderId || "",
      interpretation: this.context.connection?.interpretationFolderId || "",
      text: this.context.connection?.textFolderId || "",
    };
  }

  async ensureVaultyFolders(): Promise<{
    docs: string;
    summary: string;
    interpretation: string;
    text: string;
  }> {
    const connection = this.context.connection;
    if (!connection) throw new Error("No Google Drive connection available.");

    const rootFolderId = connection.rootFolderId || "root";

    if (!connection.docsFolderId) {
      const docsFolder = await this.createFolder("Docs", rootFolderId);
      connection.docsFolderId = docsFolder.id;
    }

    if (!connection.summaryFolderId) {
      const summaryFolder = await this.createFolder("Summary", rootFolderId);
      connection.summaryFolderId = summaryFolder.id;
    }

    if (!connection.interpretationFolderId) {
      const interpretationFolder = await this.createFolder("Interpretation", rootFolderId);
      connection.interpretationFolderId = interpretationFolder.id;
    }

    if (!connection.textFolderId) {
      const textFolder = await this.createFolder("Text", rootFolderId);
      connection.textFolderId = textFolder.id;
    }

    return {
      docs: connection.docsFolderId,
      summary: connection.summaryFolderId,
      interpretation: connection.interpretationFolderId,
      text: connection.textFolderId,
    };
  }

  async createFolderPath(folderNames: string[], rootId: string): Promise<string> {
    let currentParentId = rootId;

    this.evictExpiredCacheEntries();
    this.enforceCacheSizeLimit();

    for (const name of folderNames) {
      const cached = this.folderCache.get(currentParentId)?.get(name);
      if (cached) {
        currentParentId = cached;
        continue;
      }

      const existing = await this.listFolders(currentParentId);
      const existingFolder = existing.find((f) => f.name === name);

      if (existingFolder) {
        currentParentId = existingFolder.id;
      } else {
        const newFolder = await this.createFolder(name, currentParentId);
        currentParentId = newFolder.id;
      }

      let parentCache = this.folderCache.get(currentParentId);
      if (!parentCache) {
        parentCache = new Map();
        this.folderCache.set(currentParentId, parentCache);
      }
      parentCache.set(name, currentParentId);
      this.folderCacheTimestamps.set(currentParentId, Date.now());
    }

    return currentParentId;
  }

  private mapDriveFile(file: drive_v3.Schema$File): StorageFile {
    return {
      id: file.id || "",
      name: file.name || "",
      mimeType: file.mimeType || "",
      sizeBytes: parseInt(file.size || "0", 10),
      modifiedAt: new Date(file.modifiedTime || Date.now()),
      checksum: file.md5Checksum || undefined,
      version: file.version || undefined,
      webViewLink: file.webViewLink || undefined,
      parentId: file.parents?.[0],
    };
  }

  private mapDriveFolder(file: drive_v3.Schema$File): StorageFolder {
    return {
      id: file.id || "",
      name: file.name || "",
      modifiedAt: new Date(file.modifiedTime || Date.now()),
      parentId: file.parents?.[0],
    };
  }
}

import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { Readable } from "stream";
import { StorageProvider, StorageProviderContext, UploadOptions, UploadResult, StorageFile, StorageFolder } from "./provider";

export class GoogleDriveStorageProvider implements StorageProvider {
  readonly type = "GOOGLE_DRIVE" as const;
  private context: StorageProviderContext;
  private tokenExpiryGraceMs = 5 * 60 * 1000;

  constructor(context: StorageProviderContext) {
    this.context = context;
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

    const credentials: Record<string, unknown> = {
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
    };

    if (connection.expiresAt) {
      credentials.expiry_date = connection.expiresAt.getTime();
    }

    oauth2Client.setCredentials(credentials);
    return oauth2Client;
  }

  private async getDrive() {
    const oauth2Client = this.createOAuth2Client();
    return google.drive({ version: "v3", auth: oauth2Client });
  }

  private toStream(data: Buffer | Blob): Readable | Blob {
    if (Buffer.isBuffer(data)) {
      return Readable.from(data);
    }
    if (data instanceof Blob) {
      return data as unknown as Blob;
    }
    return Readable.from(Buffer.from(data as unknown as ArrayBuffer));
  }

  private async ensureValidToken(): Promise<string> {
    const connection = this.context.connection;
    if (!connection?.accessToken) {
      throw new Error("Google Drive not connected.");
    }

    if (connection.expiresAt && connection.expiresAt.getTime() - Date.now() < this.tokenExpiryGraceMs) {
      if (!connection.refreshToken) {
        throw new Error("Access token expired and no refresh token available.");
      }
      return this.refreshAccessToken(connection.refreshToken);
    }

    return connection.accessToken;
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials not configured.");
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    const accessToken = credentials.access_token || "";
    const expiresIn = credentials.expiry_date ? Math.floor((credentials.expiry_date - Date.now()) / 1000) : undefined;

    this.context = {
      ...this.context,
      connection: this.context.connection
        ? {
            ...this.context.connection,
            accessToken,
            expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
          }
        : undefined,
    };

    return accessToken;
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
        oldParentId = file.data.parents?.[0];
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
        body: this.toStream(options.data),
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
        body: this.toStream(options.data),
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
      { responseType: "arraybuffer" }
    );

    return Buffer.from(res.data as ArrayBuffer);
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

  async updateFile(fileId: string, options: { name?: string; parentId?: string }): Promise<StorageFile> {
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

  async getRootFolderStructure(): Promise<{ docs: string; summary: string; interpretation: string; text: string }> {
    return {
      docs: this.context.connection?.docsFolderId || "",
      summary: this.context.connection?.summaryFolderId || "",
      interpretation: this.context.connection?.interpretationFolderId || "",
      text: this.context.connection?.textFolderId || "",
    };
  }

  async ensureVaultyFolders(): Promise<{ docs: string; summary: string; interpretation: string; text: string }> {
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

    for (const name of folderNames) {
      const existing = await this.listFolders(currentParentId);
      const existingFolder = existing.find((f) => f.name === name);

      if (existingFolder) {
        currentParentId = existingFolder.id;
      } else {
        const newFolder = await this.createFolder(name, currentParentId);
        currentParentId = newFolder.id;
      }
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

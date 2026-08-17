import { StorageProvider, StorageProviderContext, UploadOptions, UploadResult, StorageFile, StorageFolder } from "./provider";

const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
  md5Checksum?: string;
  version: string;
  webViewLink?: string;
  parents?: string[];
}

interface DriveFolder {
  id: string;
  name: string;
  modifiedTime: string;
  parents?: string[];
}

export class GoogleDriveStorageProvider implements StorageProvider {
  readonly type = "GOOGLE_DRIVE" as const;
  private context: StorageProviderContext;
  private tokenExpiryGraceMs = 5 * 60 * 1000;

  constructor(context: StorageProviderContext) {
    this.context = context;
  }

  private async getAccessToken(): Promise<string> {
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

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("refresh_token", refreshToken);
    params.append("grant_type", "refresh_token");

    const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to refresh Google access token: ${res.status} ${text}`);
    }

    const data = await res.json();
    const accessToken = data.access_token as string;
    const expiresIn = data.expires_in as number | undefined;

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

  private async driveRequest(path: string, options: RequestInit = {}): Promise<any> {
    const accessToken = await this.getAccessToken();
    const url = `${GOOGLE_DRIVE_API_BASE}${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = `Google Drive API error: ${res.status} ${text}`;
      try {
        const err = JSON.parse(text);
        errorMessage = err.error?.message || errorMessage;
      } catch {
        // use default error message
      }
      throw new Error(errorMessage);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  private buildQuery(params: Record<string, string | undefined | null>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, value);
      }
    }
    const qs = searchParams.toString();
    return qs ? `?${qs}` : "";
  }

  async createFolder(name: string, parentId?: string): Promise<StorageFolder> {
    const folderMetadata: Record<string, unknown> = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) (folderMetadata as { parents: string[] }).parents = [parentId];

    const folder = await this.driveRequest("/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...folderMetadata,
        fields: "id,name,modifiedTime,parents",
      }),
    });

    return this.mapDriveFolder(folder);
  }

  async renameFolder(folderId: string, newName: string): Promise<StorageFolder> {
    const folder = await this.driveRequest(`/files/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        fields: "id,name,modifiedTime,parents",
      }),
    });

    return this.mapDriveFolder(folder);
  }

  async moveFolder(folderId: string, newParentId: string | null): Promise<StorageFolder> {
    const body: Record<string, unknown> = {
      fields: "id,name,modifiedTime,parents",
    };

    if (newParentId) {
      body.addParents = newParentId;
    } else {
      body.removeParents = "root";
    }

    const folder = await this.driveRequest(`/files/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return this.mapDriveFolder(folder);
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.driveRequest(`/files/${folderId}`, { method: "DELETE" });
  }

  async listFolders(parentId?: string): Promise<StorageFolder[]> {
    const parent = parentId || "root";
    const query = `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const files = await this.driveRequest(`/files${this.buildQuery({
      q: query,
      fields: "files(id,name,modifiedTime,parents)",
      pageSize: "1000",
    })}`);

    return (files.files || []).map(this.mapDriveFolder);
  }

  async uploadFile(options: UploadOptions): Promise<UploadResult> {
    const accessToken = await this.getAccessToken();
    const parentId = options.parentId || "root";

    const boundary = `-------${Date.now()}`;
    const contentType = options.mimeType || "application/octet-stream";

    const metadata = JSON.stringify({
      name: options.filename,
      mimeType: contentType,
      parents: [parentId],
    });

    let body: BodyInit;
    if (options.data instanceof Buffer) {
      const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
      const bufferData = options.data as Buffer;
      body = new Uint8Array(Buffer.concat([
        Buffer.from(metaPart),
        bufferData,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]).buffer);
    } else {
      const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
      const blobData = options.data as Blob;
      const blobText = await blobData.text();
      body = `${metaPart}${blobText}\r\n--${boundary}--\r\n`;
    }

    const res = await fetch(`${GOOGLE_DRIVE_API_BASE}/files?uploadType=multipart&fields=id,name,size,modifiedTime,md5Checksum,version,webViewLink,parents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to upload file to Google Drive: ${res.status} ${text}`);
    }

    const file = await res.json();
    return this.mapDriveFile(file);
  }

  async uploadFileResumable(options: UploadOptions, parentId?: string): Promise<UploadResult> {
    const accessToken = await this.getAccessToken();
    const targetParentId = parentId || options.parentId || "root";

    const metadata = {
      name: options.filename,
      mimeType: options.mimeType || "application/octet-stream",
      parents: [targetParentId],
    };

    const res = await fetch(`${GOOGLE_DRIVE_API_BASE}/files?uploadType=resumable&fields=id,name,size,modifiedTime,md5Checksum,version,webViewLink,parents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to initiate resumable upload: ${res.status} ${text}`);
    }

    const uploadUrl = res.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("No upload URL returned from Google Drive.");
    }

    const data: Buffer = options.data instanceof Buffer ? options.data : Buffer.from(await (options.data as Blob).arrayBuffer());
    const chunkSize = 256 * 1024;
    let start = 0;

    while (start < data.length) {
      const end = Math.min(start + chunkSize, data.length);
      const chunk = data.slice(start, end);
      const contentRange = `bytes ${start}-${end - 1}/${data.length}`;

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Range": contentRange,
          "Content-Length": String(chunk.length),
        },
        body: chunk,
      });

      if (uploadRes.status === 308) {
        start = end;
        continue;
      }

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Resumable upload failed: ${uploadRes.status} ${text}`);
      }

      const file = await uploadRes.json();
      return this.mapDriveFile(file);
    }

    const finalRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Range": `bytes */${data.length}`,
      },
    });

    if (!finalRes.ok) {
      const text = await finalRes.text();
      throw new Error(`Final resumable upload failed: ${finalRes.status} ${text}`);
    }

    const file = await finalRes.json();
    return this.mapDriveFile(file);
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const res = await this.driveRequest(`/files/${fileId}?alt=media`);
    if (res instanceof Uint8Array) {
      return Buffer.from(res);
    }
    return Buffer.from(await res.text());
  }

  async getFile(fileId: string): Promise<StorageFile | null> {
    try {
      const file = await this.driveRequest(`/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,md5Checksum,version,webViewLink,parents`);
      if (!file || file.id !== fileId) return null;
      return this.mapDriveFile(file);
    } catch {
      return null;
    }
  }

  async updateFile(fileId: string, options: { name?: string; parentId?: string }): Promise<StorageFile> {
    const body: Record<string, unknown> = {
      fields: "id,name,mimeType,size,modifiedTime,md5Checksum,version,webViewLink,parents",
    };

    if (options.name) body.name = options.name;

    if (options.parentId) {
      body.addParents = options.parentId;
    }

    const file = await this.driveRequest(`/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return this.mapDriveFile(file);
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.driveRequest(`/files/${fileId}`, { method: "DELETE" });
  }

  async listFiles(parentId?: string): Promise<StorageFile[]> {
    const parent = parentId || "root";
    const query = `'${parent}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`;
    const files = await this.driveRequest(`/files${this.buildQuery({
      q: query,
      fields: "files(id,name,mimeType,size,modifiedTime,md5Checksum,version,webViewLink,parents)",
      pageSize: "1000",
    })}`);

    return (files.files || []).map(this.mapDriveFile);
  }

  async getRootFolderStructure(): Promise<{ docs: string; summary: string; text: string }> {
    return {
      docs: this.context.connection?.docsFolderId || "",
      summary: this.context.connection?.summaryFolderId || "",
      text: this.context.connection?.textFolderId || "",
    };
  }

  async ensureVaultyFolders(): Promise<{ docs: string; summary: string; text: string }> {
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

    if (!connection.textFolderId) {
      const textFolder = await this.createFolder("Text", rootFolderId);
      connection.textFolderId = textFolder.id;
    }

    return {
      docs: connection.docsFolderId,
      summary: connection.summaryFolderId,
      text: connection.textFolderId,
    };
  }

  private mapDriveFile(file: DriveFile): StorageFile {
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: parseInt(file.size || "0", 10),
      modifiedAt: new Date(file.modifiedTime),
      checksum: file.md5Checksum,
      version: file.version,
      webViewLink: file.webViewLink,
      parentId: file.parents?.[0],
    };
  }

  private mapDriveFolder(folder: DriveFolder): StorageFolder {
    return {
      id: folder.id,
      name: folder.name,
      modifiedAt: new Date(folder.modifiedTime),
      parentId: folder.parents?.[0],
    };
  }
}

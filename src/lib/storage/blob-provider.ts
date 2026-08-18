import { put, del } from "@vercel/blob";
import { StorageProvider, UploadOptions, UploadResult, StorageFile, StorageFolder } from "./provider";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";

export class VercelBlobStorageProvider implements StorageProvider {
  readonly type = "VERCEL_BLOB" as const;

  async createFolder(_name: string, _parentId?: string): Promise<StorageFolder> {
    throw new Error("Vercel Blob does not support folders. Folders are virtual in Vaulty.");
  }

  async renameFolder(_folderId: string, _newName: string): Promise<StorageFolder> {
    throw new Error("Vercel Blob does not support folders. Folders are virtual in Vaulty.");
  }

  async moveFolder(_folderId: string, _newParentId: string | null): Promise<StorageFolder> {
    throw new Error("Vercel Blob does not support folders. Folders are virtual in Vaulty.");
  }

  async deleteFolder(_folderId: string): Promise<void> {
    throw new Error("Vercel Blob does not support folders. Folders are virtual in Vaulty.");
  }

  async listFolders(_parentId?: string): Promise<StorageFolder[]> {
    return [];
  }

  async uploadFile(options: UploadOptions): Promise<UploadResult> {
    const blobPathname = options.filename;
    
    const blob = await put(blobPathname, options.data, {
      access: "private",
      token: BLOB_TOKEN,
      addRandomSuffix: false,
    });

    return {
      id: blob.pathname,
      name: options.filename,
      sizeBytes: options.data instanceof Blob ? options.data.size : options.data.length,
      modifiedAt: new Date(),
      parentId: undefined,
    };
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const url = this.resolveBlobUrl(fileId);
    const res = await fetch(url, {
      headers: BLOB_TOKEN ? { Authorization: `Bearer ${BLOB_TOKEN}` } : {},
    });

    if (!res.ok) {
      const directRes = await fetch(url);
      if (!directRes.ok) {
        throw new Error(`Failed to fetch blob file: ${fileId}`);
      }
      return Buffer.from(await directRes.arrayBuffer());
    }

    return Buffer.from(await res.arrayBuffer());
  }

  async getFile(fileId: string): Promise<StorageFile | null> {
    try {
      const url = this.resolveBlobUrl(fileId);
      const res = await fetch(url, {
        headers: BLOB_TOKEN ? { Authorization: `Bearer ${BLOB_TOKEN}` } : {},
      });

      if (!res.ok) {
        const directRes = await fetch(url);
        if (!directRes.ok) return null;
        const buffer = Buffer.from(await directRes.arrayBuffer());
        return {
          id: fileId,
          name: fileId.split("/").pop() || fileId,
          mimeType: directRes.headers.get("content-type") || "application/octet-stream",
          sizeBytes: buffer.length,
          modifiedAt: new Date(),
        };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        id: fileId,
        name: fileId.split("/").pop() || fileId,
        mimeType: res.headers.get("content-type") || "application/octet-stream",
        sizeBytes: buffer.length,
        modifiedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  async updateFile(fileId: string, options: { name?: string; parentId?: string }): Promise<StorageFile> {
    const blob = await put(fileId, "", {
      access: "private",
      token: BLOB_TOKEN,
      addRandomSuffix: false,
    });

    return {
      id: blob.pathname,
      name: options.name || fileId.split("/").pop() || fileId,
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      modifiedAt: new Date(),
      parentId: options.parentId,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    const url = this.resolveBlobUrl(fileId);
    try {
      await del(url, { token: BLOB_TOKEN });
    } catch (err) {
      console.error("Error deleting Vercel Blob:", err);
    }
  }

  async listFiles(_parentId?: string): Promise<StorageFile[]> {
    return [];
  }

  async getRootFolderStructure(): Promise<{ docs: string; summary: string; text: string }> {
    return { docs: "", summary: "", text: "" };
  }

  async ensureVaultyFolders(): Promise<{ docs: string; summary: string; text: string }> {
    return { docs: "", summary: "", text: "" };
  }

  async createFolderPath(_folderNames: string[], _rootId: string): Promise<string> {
    throw new Error("Vercel Blob does not support folders. Folders are virtual in Vaulty.");
  }

  private resolveBlobUrl(pathname: string): string {
    if (pathname.startsWith("http")) return pathname;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return `${baseUrl}/api/storage/blob/${encodeURIComponent(pathname)}`;
  }
}

import { User } from "@prisma/client";

export type StorageProviderType = "GOOGLE_DRIVE" | "VERCEL_BLOB";

export interface StorageFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: Date;
  checksum?: string;
  version?: string;
  webViewLink?: string;
  parentId?: string;
}

export interface StorageFolder {
  id: string;
  name: string;
  parentId?: string;
  modifiedAt: Date;
}

export interface UploadOptions {
  filename: string;
  mimeType: string;
  data: Buffer | Blob;
  parentId?: string;
  checksum?: string;
}

export interface UploadResult {
  id: string;
  name: string;
  sizeBytes: number;
  modifiedAt: Date;
  checksum?: string;
  version?: string;
  webViewLink?: string;
  parentId?: string;
}

export interface StorageProvider {
  readonly type: StorageProviderType;

  createFolder(name: string, parentId?: string): Promise<StorageFolder>;
  renameFolder(folderId: string, newName: string): Promise<StorageFolder>;
  moveFolder(folderId: string, newParentId: string | null): Promise<StorageFolder>;
  deleteFolder(folderId: string): Promise<void>;
  listFolders(parentId?: string): Promise<StorageFolder[]>;

  uploadFile(options: UploadOptions): Promise<UploadResult>;
  downloadFile(fileId: string): Promise<Buffer>;
  getFile(fileId: string): Promise<StorageFile | null>;
  updateFile(fileId: string, options: { name?: string; parentId?: string }): Promise<StorageFile>;
  deleteFile(fileId: string): Promise<void>;
  listFiles(parentId?: string): Promise<StorageFile[]>;

  getRootFolderStructure(): Promise<{ docs: string; summary: string; interpretation: string; text: string }>;
  ensureVaultyFolders(): Promise<{ docs: string; summary: string; interpretation: string; text: string }>;
  createFolderPath(folderNames: string[], rootId: string): Promise<string>;
}

export interface StorageProviderContext {
  user: User;
  connection?: {
    id: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
    rootFolderId?: string;
    docsFolderId?: string;
    summaryFolderId?: string;
    textFolderId?: string;
    interpretationFolderId?: string;
    pageToken?: string;
  };
}

export type ProviderFactory = (context: StorageProviderContext) => StorageProvider;

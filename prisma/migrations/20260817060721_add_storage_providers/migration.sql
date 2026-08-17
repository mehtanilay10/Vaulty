-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('GOOGLE_DRIVE', 'VERCEL_BLOB');

-- CreateEnum
CREATE TYPE "StorageConnectionStatus" AS ENUM ('CONNECTED', 'SYNCING', 'SYNCED', 'PENDING', 'FAILED', 'DISCONNECTED', 'RECONNECT_REQUIRED');

-- CreateEnum
CREATE TYPE "DocumentStorageStatus" AS ENUM ('ACTIVE', 'DELETED_EXTERNALLY', 'PENDING', 'FAILED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "SyncEventStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "SyncEventOperation" AS ENUM ('UPLOAD', 'DOWNLOAD', 'UPDATE', 'RENAME', 'MOVE', 'DELETE', 'IMPORT', 'CONFLICT');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "googleDriveSummaryFileId" TEXT,
ADD COLUMN     "googleDriveTextFileId" TEXT,
ADD COLUMN     "storageChecksum" TEXT,
ADD COLUMN     "storageFileId" TEXT,
ADD COLUMN     "storageModifiedAt" TIMESTAMP(3),
ADD COLUMN     "storageParentId" TEXT,
ADD COLUMN     "storageProvider" "StorageProvider" NOT NULL DEFAULT 'VERCEL_BLOB',
ADD COLUMN     "storageStatus" "DocumentStorageStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "storageVersion" TEXT,
ADD COLUMN     "storageWebViewLink" TEXT,
ALTER COLUMN "blobUrl" DROP NOT NULL,
ALTER COLUMN "blobPath" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "storageFolderId" TEXT,
ADD COLUMN     "storageProvider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultStorageProvider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE';

-- CreateTable
CREATE TABLE "StorageConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "status" "StorageConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "rootFolderId" TEXT,
    "docsFolderId" TEXT,
    "summaryFolderId" TEXT,
    "textFolderId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "pageToken" TEXT,
    "channelId" TEXT,
    "channelResourceId" TEXT,
    "channelExpiration" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "documentId" TEXT,
    "folderId" TEXT,
    "operation" "SyncEventOperation" NOT NULL,
    "status" "SyncEventStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "connectionId" TEXT,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageConnection_userId_idx" ON "StorageConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageConnection_userId_provider_key" ON "StorageConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "SyncEvent_userId_idx" ON "SyncEvent"("userId");

-- CreateIndex
CREATE INDEX "SyncEvent_documentId_idx" ON "SyncEvent"("documentId");

-- CreateIndex
CREATE INDEX "SyncEvent_createdAt_idx" ON "SyncEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Document_storageFileId_idx" ON "Document"("storageFileId");

-- CreateIndex
CREATE INDEX "Folder_storageFolderId_idx" ON "Folder"("storageFolderId");

-- AddForeignKey
ALTER TABLE "StorageConnection" ADD CONSTRAINT "StorageConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StorageConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "googleDriveInterpretationFileId" TEXT;

-- AlterTable
ALTER TABLE "StorageConnection" ADD COLUMN     "interpretationFolderId" TEXT;

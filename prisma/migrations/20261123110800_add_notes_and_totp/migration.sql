-- AlterTable
ALTER TABLE "AppCredential" ADD COLUMN     "totpSecret" TEXT;

-- AlterTable
ALTER TABLE "FamilyInvitation" ADD COLUMN     "shareNotes" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FamilyMembership" ADD COLUMN     "shareNotes" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "NotePage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "todos" JSONB,
    "images" JSONB,
    "color" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotePage_userId_isPinned_idx" ON "NotePage"("userId", "isPinned");

-- CreateIndex
CREATE INDEX "NotePage_userId_updatedAt_idx" ON "NotePage"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "NotePage" ADD CONSTRAINT "NotePage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

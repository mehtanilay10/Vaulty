import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderForUser } from "@/lib/storage/factory";
import { validateCSRFRequest } from "@/lib/csrf";

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const connection = await prisma.storageConnection.findFirst({
      where: { userId: user.id, provider: "GOOGLE_DRIVE" },
    });

    if (!connection || !connection.docsFolderId) {
      return NextResponse.json(
        { error: "Google Drive not connected or docs folder not found." },
        { status: 400 },
      );
    }

    const { provider } = await getProviderForUser(user.id, "GOOGLE_DRIVE");

    async function deleteAllInFolder(
      parentId: string,
    ): Promise<{ files: number; folders: number }> {
      const files = await provider.listFiles(parentId);
      let fileCount = 0;
      let folderCount = 0;
      for (const file of files) {
        try {
          await provider.deleteFile(file.id);
          fileCount++;
        } catch (err) {
          console.error("Failed to delete file:", file.id, err);
        }
      }

      const folders = await provider.listFolders(parentId);
      for (const folder of folders) {
        try {
          const childCounts = await deleteAllInFolder(folder.id);
          fileCount += childCounts.files;
          folderCount += childCounts.folders + 1;
          await provider.deleteFolder(folder.id);
        } catch (err) {
          console.error("Failed to delete folder:", folder.id, err);
        }
      }
      return { files: fileCount, folders: folderCount };
    }

    const counts = await deleteAllInFolder(connection.docsFolderId);

    await prisma.document.updateMany({
      where: { ownerId: user.id, storageProvider: "GOOGLE_DRIVE" },
      data: {
        storageFileId: null,
        storageParentId: null,
        storageModifiedAt: null,
        storageChecksum: null,
        storageVersion: null,
        storageWebViewLink: null,
        storageStatus: "ACTIVE",
      },
    });

    await prisma.folder.updateMany({
      where: { ownerId: user.id, storageProvider: "GOOGLE_DRIVE" },
      data: { storageFolderId: null },
    });

    await prisma.aiProcessing.updateMany({
      where: { document: { ownerId: user.id } },
      data: {
        extractedText: null,
        summaryMarkdown: null,
        interpretationMarkdown: null,
        errorMessage: null,
        modelUsed: null,
        processedAt: null,
        status: "NOT_REQUESTED",
      },
    });

    return NextResponse.json({ success: true, counts });
  } catch (error) {
    console.error("DELETE /api/user/drive-docs error:", error);
    return NextResponse.json({ error: "Failed to delete Drive documents." }, { status: 500 });
  }
}

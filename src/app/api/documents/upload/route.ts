import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { validateFileTypeAndExtension, getMaxUploadSize, uploadPrivateBlob } from "@/lib/blob";
import { processDocumentWithGemini, GEMINI_MODEL } from "@/lib/gemini";
import { getProviderForUser, getProviderForDocument } from "@/lib/storage/factory";
import type { StorageProviderType } from "@/lib/storage/provider";

async function getFolderHierarchyPath(folderId: string): Promise<string> {
  const segments: string[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const targetFolder: { name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: currentId },
        select: { name: true, parentId: true },
      });
    if (!targetFolder) break;
    const cleanSegment = targetFolder.name.replace(/[/\\?%*:|"<>]/g, "_").trim();
    segments.unshift(cleanSegment);
    currentId = targetFolder.parentId;
  }

  return segments.join("/");
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folderId = formData.get("folderId") as string | null;
    const customName = formData.get("name") as string | null;
    const tagsInput = formData.get("tags") as string | null;
    const generateAi = formData.get("generateAi") === "true";

    if (!file) {
      return NextResponse.json({ error: "No document file provided." }, { status: 400 });
    }

    if (!folderId) {
      return NextResponse.json({ error: "Target folder is required." }, { status: 400 });
    }

    const folderAccess = await checkFolderAccess(user.id, folderId);
    if (!folderAccess.isOwner) {
      return NextResponse.json(
        { error: "You can only upload documents to folders you own." },
        { status: 403 }
      );
    }

    const validation = validateFileTypeAndExtension(file.name, file.type);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const maxSize = getMaxUploadSize();
    if (file.size > maxSize) {
      const maxMb = Math.round(maxSize / (1024 * 1024));
      return NextResponse.json(
        { error: `File size exceeds maximum limit of ${maxMb}MB.` },
        { status: 400 }
      );
    }

    const docName = (customName && customName.trim()) || file.name;
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { defaultStorageProvider: true },
    });

    const storageProvider: StorageProviderType = userRecord?.defaultStorageProvider || "GOOGLE_DRIVE";

    let blobUrl: string | null = null;
    let blobPath: string | null = null;
    let storageFileId: string | null = null;
    let storageParentId: string | null = null;
    let storageModifiedAt: Date | null = null;
    let storageChecksum: string | null = null;
    let storageVersion: string | null = null;
    let storageWebViewLink: string | null = null;

    if (storageProvider === "GOOGLE_DRIVE") {
      try {
        const { provider } = await getProviderForUser(user.id, storageProvider);
        const vaultyFolders = await provider.ensureVaultyFolders();
        const docsFolderId = vaultyFolders.docs;

        let targetDriveParentId = docsFolderId;

        if (folderId) {
          const vaultyFolder = await prisma.folder.findUnique({
            where: { id: folderId },
            select: { name: true, parentId: true, storageFolderId: true },
          });

          if (vaultyFolder?.storageFolderId) {
            targetDriveParentId = vaultyFolder.storageFolderId;
          } else if (vaultyFolder) {
            const pathNames: string[] = [];
            let current: { name: string; parentId: string | null } | null = vaultyFolder;

            while (current) {
              pathNames.unshift(current.name);
              if (!current.parentId) break;
              const ancestor: { name: string; parentId: string | null } | null = await prisma.folder.findUnique({
                where: { id: current.parentId },
                select: { name: true, parentId: true },
              });
              current = ancestor;
            }

            targetDriveParentId = await provider.createFolderPath(pathNames, docsFolderId);
            await prisma.folder.update({
              where: { id: folderId },
              data: { storageFolderId: targetDriveParentId },
            });
          }
        }

        const cleanFileName = docName.replace(/[/\\?%*:|"<>]/g, "_");

        const uploadResult = await provider.uploadFile({
          filename: cleanFileName,
          mimeType: file.type || "application/octet-stream",
          data: fileBuffer,
          parentId: targetDriveParentId,
        });

        storageFileId = uploadResult.id;
        storageParentId = uploadResult.parentId || null;
        storageModifiedAt = uploadResult.modifiedAt;
        storageChecksum = uploadResult.checksum || null;
        storageVersion = uploadResult.version || null;
        storageWebViewLink = uploadResult.webViewLink || null;
      } catch (driveError: any) {
        console.error("Google Drive upload failed:", driveError);
        const message = driveError?.message || "";
        if (message.includes("not connected")) {
          return NextResponse.json(
            { error: "Google Drive is not connected. Please connect your Google Drive account in settings, or switch your default storage provider to Vercel Blob." },
            { status: 400 }
          );
        }
        throw new Error(driveError?.message || "Google Drive upload failed. Please check your Drive connection or switch your default storage provider to Vercel Blob.");
      }
    } else {
      const cleanUserName = (user.name || user.email || user.id)
        .replace(/[/\\?%*:|"<>]/g, "_")
        .trim();
      const folderPath = await getFolderHierarchyPath(folderId);
      const cleanFileName = docName.replace(/[/\\?%*:|"<>]/g, "_");
      const fullBlobPath = `vaulty-docs/${cleanUserName}/${folderPath}/${cleanFileName}`;
      const blobResult = await uploadPrivateBlob(file.name, fileBuffer, fullBlobPath);
      blobUrl = blobResult.url;
      blobPath = blobResult.pathname;
    }

    const document = await prisma.document.create({
      data: {
        name: docName,
        blobUrl,
        blobPath,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        folderId: folderId,
        ownerId: user.id,
        storageProvider: storageFileId ? "GOOGLE_DRIVE" : "VERCEL_BLOB",
        storageFileId,
        storageParentId,
        storageModifiedAt,
        storageChecksum,
        storageVersion,
        storageWebViewLink,
        storageStatus: "ACTIVE",
      },
    });

    if (tagsInput) {
      const rawTags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      for (const rawTag of rawTags) {
        const normalizedName = rawTag.toLowerCase();
        const tag = await prisma.tag.upsert({
          where: { name: normalizedName },
          update: {},
          create: { name: normalizedName },
        });

        await prisma.documentTag.create({
          data: {
            documentId: document.id,
            tagId: tag.id,
          },
        });
      }
    }

    if (generateAi) {
      const aiRecord = await prisma.aiProcessing.create({
        data: {
          documentId: document.id,
          status: "QUEUED",
          modelUsed: GEMINI_MODEL,
        },
      });

      (async () => {
        try {
          await prisma.aiProcessing.update({
            where: { id: aiRecord.id },
            data: { status: "PROCESSING" },
          });

          const geminiResult = await processDocumentWithGemini(
            fileBuffer,
            file.type,
            docName
          );

          let textFileId: string | null = null;
          let summaryFileId: string | null = null;
          let interpretationFileId: string | null = null;

          try {
            const { provider } = await getProviderForUser(user.id, "GOOGLE_DRIVE");
            const vaultyFolders = await provider.ensureVaultyFolders();
            const baseName = docName.replace(/[/\\?%*:|"<>]/g, "_");

            const textUpload = await provider.uploadFile({
              filename: `${baseName}.txt`,
              mimeType: "text/plain",
              data: Buffer.from(geminiResult.extractedText),
              parentId: vaultyFolders.text,
            });
            textFileId = textUpload.id;

            const summaryUpload = await provider.uploadFile({
              filename: `${baseName}.md`,
              mimeType: "text/markdown",
              data: Buffer.from(geminiResult.summaryMarkdown),
              parentId: vaultyFolders.summary,
            });
            summaryFileId = summaryUpload.id;

            const interpretationUpload = await provider.uploadFile({
              filename: `${baseName}.md`,
              mimeType: "text/markdown",
              data: Buffer.from(geminiResult.interpretationMarkdown),
              parentId: vaultyFolders.interpretation,
            });
            interpretationFileId = interpretationUpload.id;
          } catch (driveAiErr) {
            console.error("Failed to upload AI files to Google Drive:", driveAiErr);
          }

          await prisma.aiProcessing.update({
            where: { id: aiRecord.id },
            data: {
              status: "COMPLETED",
              extractedText: geminiResult.extractedText,
              summaryMarkdown: geminiResult.summaryMarkdown,
              interpretationMarkdown: geminiResult.interpretationMarkdown,
              processedAt: new Date(),
            },
          });

          if (textFileId || summaryFileId || interpretationFileId) {
            await prisma.document.update({
              where: { id: document.id },
              data: {
                googleDriveSummaryFileId: summaryFileId,
                googleDriveTextFileId: textFileId,
                googleDriveInterpretationFileId: interpretationFileId,
              },
            });
          }
        } catch (aiErr: any) {
          console.error("Async Gemini processing error:", aiErr);
          await prisma.aiProcessing.update({
            where: { id: aiRecord.id },
            data: {
              status: "FAILED",
              errorMessage: aiErr?.message || "AI processing failed.",
            },
          });
        }
      })();
    }

    await prisma.auditLog.create({
      data: {
        action: "DOCUMENT_UPLOAD",
        userId: user.id,
        documentId: document.id,
        folderId: folderId,
        metadata: JSON.stringify({
          documentName: document.name,
          sizeBytes: document.sizeBytes,
          storageProvider,
          storageFileId: storageFileId || undefined,
        }),
      },
    });

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    console.error("POST /api/documents/upload error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during document upload." },
      { status: 500 }
    );
  }
}

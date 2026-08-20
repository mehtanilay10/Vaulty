import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { processDocumentWithGemini, GEMINI_MODEL } from "@/lib/gemini";
import { getProviderForUser, getProviderForDocument } from "@/lib/storage/factory";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { status } = body;

    let targetStatuses: string[];
    if (status === "FAILED") {
      targetStatuses = ["FAILED"];
    } else if (status === "PENDING") {
      targetStatuses = ["QUEUED", "PROCESSING"];
    } else {
      targetStatuses = ["QUEUED", "PROCESSING", "FAILED"];
    }

    const aiRecords = await prisma.aiProcessing.findMany({
      where: {
        document: { ownerId: user.id },
        status: { in: targetStatuses as any },
      },
      include: {
        document: true,
      },
      take: 50,
    });

    const results = [];
    for (const record of aiRecords) {
      try {
        await prisma.aiProcessing.update({
          where: { id: record.id },
          data: { status: "QUEUED", errorMessage: null },
        });

        (async () => {
          try {
            await prisma.aiProcessing.update({
              where: { id: record.id },
              data: { status: "PROCESSING" },
            });

            let fileBuffer: Buffer;
            if (record.document.storageProvider === "GOOGLE_DRIVE" && record.document.storageFileId) {
              const { provider } = await getProviderForDocument({
                id: record.document.id,
                storageProvider: record.document.storageProvider,
                storageFileId: record.document.storageFileId,
                ownerId: user.id,
                folderId: record.document.folderId,
              });
              fileBuffer = await provider.downloadFile(record.document.storageFileId);
            } else if (record.document.blobUrl) {
              const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
              const fileRes = await fetch(record.document.blobUrl, {
                headers: blobToken ? { Authorization: `Bearer ${blobToken}` } : {},
              });
              if (!fileRes.ok) throw new Error("Failed to download blob.");
              fileBuffer = Buffer.from(await fileRes.arrayBuffer());
            } else {
              throw new Error("Document file not available.");
            }

            const geminiResult = await processDocumentWithGemini(
              fileBuffer,
              record.document.mimeType,
              record.document.name
            );

            let textFileId: string | null = null;
            let summaryFileId: string | null = null;
            let interpretationFileId: string | null = null;

            try {
              const { provider } = await getProviderForUser(user.id, "GOOGLE_DRIVE");
              const vaultyFolders = await provider.ensureVaultyFolders();
              const baseName = record.document.name.replace(/[/\\?%*:|"<>]/g, "_");

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
              where: { id: record.id },
              data: {
                status: "COMPLETED",
                extractedText: geminiResult.extractedText,
                summaryMarkdown: geminiResult.summaryMarkdown,
                interpretationMarkdown: geminiResult.interpretationMarkdown,
                processedAt: new Date(),
                errorMessage: null,
              },
            });

            if (textFileId || summaryFileId || interpretationFileId) {
              await prisma.document.update({
                where: { id: record.document.id },
                data: {
                  googleDriveSummaryFileId: summaryFileId,
                  googleDriveTextFileId: textFileId,
                  googleDriveInterpretationFileId: interpretationFileId,
                },
              });
            }
          } catch (err: any) {
            console.error("Batch AI processing error:", err);
            await prisma.aiProcessing.update({
              where: { id: record.id },
              data: {
                status: "FAILED",
                errorMessage: err?.message || "AI processing failed.",
              },
            });
          }
        })();

        results.push({ documentId: record.documentId, status: "QUEUED" });
      } catch (err: any) {
        results.push({ documentId: record.documentId, status: "FAILED", error: err?.message });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("POST /api/documents/ai/batch error:", error);
    return NextResponse.json({ error: "Failed to batch process AI." }, { status: 500 });
  }
}

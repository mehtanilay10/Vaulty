import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { validateFileTypeAndExtension, getMaxUploadSize, uploadPrivateBlob } from "@/lib/blob";
import { processDocumentWithGemini } from "@/lib/gemini";

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

    // 1. Authorization Check: Must be folder owner
    const folderAccess = await checkFolderAccess(user.id, folderId);
    if (!folderAccess.isOwner) {
      return NextResponse.json(
        { error: "You can only upload documents to folders you own." },
        { status: 403 }
      );
    }

    // 2. Validate MIME & File extension
    const validation = validateFileTypeAndExtension(file.name, file.type);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 3. Size limit check
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

    // 4. Upload to Vercel Blob Private Storage
    const blobResult = await uploadPrivateBlob(file.name, fileBuffer);

    // 5. Save Document in DB
    const document = await prisma.document.create({
      data: {
        name: docName,
        blobUrl: blobResult.url,
        blobPath: blobResult.pathname,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        folderId: folderId,
        ownerId: user.id,
      },
    });

    // 6. Save Tags
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

    // 7. Handle AI Processing Request
    if (generateAi) {
      const aiRecord = await prisma.aiProcessing.create({
        data: {
          documentId: document.id,
          status: "QUEUED",
          modelUsed: "gemini-2.5-flash",
        },
      });

      // Asynchronous Gemini AI Execution (Non-blocking response)
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

    // 8. Create Audit Log
    await prisma.auditLog.create({
      data: {
        action: "DOCUMENT_UPLOAD",
        userId: user.id,
        documentId: document.id,
        folderId: folderId,
        metadata: JSON.stringify({ documentName: document.name, sizeBytes: document.sizeBytes }),
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

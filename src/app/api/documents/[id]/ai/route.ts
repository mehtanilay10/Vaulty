import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess } from "@/lib/authz";
import { processDocumentWithGemini, GEMINI_MODEL } from "@/lib/gemini";
import { getProviderForDocument } from "@/lib/storage/factory";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const access = await checkDocumentAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the document owner can trigger or retry AI processing." },
        { status: 403 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, name: true, mimeType: true, blobUrl: true, storageProvider: true, storageFileId: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const aiRecord = await prisma.aiProcessing.upsert({
      where: { documentId: id },
      update: {
        status: "QUEUED",
        errorMessage: null,
      },
      create: {
        documentId: id,
        status: "QUEUED",
        modelUsed: GEMINI_MODEL,
      },
    });

    let fileBuffer: Buffer;
    try {
      if (document.storageProvider === "GOOGLE_DRIVE" && document.storageFileId) {
        const { provider } = await getProviderForDocument({
          id: document.id,
          storageProvider: document.storageProvider,
          storageFileId: document.storageFileId,
          ownerId: user.id,
          folderId: "",
        });
        fileBuffer = await provider.downloadFile(document.storageFileId);
      } else if (document.blobUrl) {
        const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
        const fileRes = await fetch(document.blobUrl, {
          headers: blobToken ? { Authorization: `Bearer ${blobToken}` } : {},
        });
        if (!fileRes.ok) {
          throw new Error("Failed to download document file from storage.");
        }
        fileBuffer = Buffer.from(await fileRes.arrayBuffer());
      } else {
        throw new Error("Document file not available for AI processing.");
      }
    } catch (fetchErr) {
      await prisma.aiProcessing.update({
        where: { id: aiRecord.id },
        data: {
          status: "FAILED",
          errorMessage: "Failed to download document file for AI processing.",
        },
      });
      return NextResponse.json(
        { error: "Could not fetch document file for AI processing." },
        { status: 500 }
      );
    }

    (async () => {
      try {
        await prisma.aiProcessing.update({
          where: { id: aiRecord.id },
          data: { status: "PROCESSING" },
        });

        const result = await processDocumentWithGemini(
          fileBuffer,
          document.mimeType,
          document.name
        );

        await prisma.aiProcessing.update({
          where: { id: aiRecord.id },
          data: {
            status: "COMPLETED",
            extractedText: result.extractedText,
            summaryMarkdown: result.summaryMarkdown,
            interpretationMarkdown: result.interpretationMarkdown,
            processedAt: new Date(),
            errorMessage: null,
          },
        });
      } catch (err: any) {
        console.error("Gemini AI retry error:", err);
        await prisma.aiProcessing.update({
          where: { id: aiRecord.id },
          data: {
            status: "FAILED",
            errorMessage: err?.message || "AI processing failed.",
          },
        });
      }
    })();

    return NextResponse.json({
      message: "AI processing initiated successfully.",
      status: "QUEUED",
    });
  } catch (error) {
    console.error("POST /api/documents/[id]/ai error:", error);
    return NextResponse.json(
      { error: "An error occurred while starting AI processing." },
      { status: 500 }
    );
  }
}

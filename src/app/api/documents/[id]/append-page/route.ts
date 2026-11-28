import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess } from "@/lib/authz";
import { validateCSRFRequest } from "@/lib/csrf";
import { getProviderForDocument } from "@/lib/storage/factory";
import { appendPagesToPdf, convertImageToPdf } from "@/lib/scanner/pdf-stitcher";
import { ensureAiJobAndProcessing } from "@/lib/ai/job-service";
import { GEMINI_MODEL } from "@/lib/gemini";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.documentsAppendPage,
    });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const access = await checkDocumentAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the document owner can append pages." },
        { status: 403 },
      );
    }

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        mimeType: true,
        storageProvider: true,
        storageFileId: true,
        storageParentId: true,
        ownerId: true,
        folderId: true,
      },
    });

    if (!document || !document.storageFileId) {
      return NextResponse.json(
        { error: "Document or associated Google Drive file not found." },
        { status: 404 },
      );
    }

    const formData = await req.formData();
    const newPageFile = formData.get("file") as File | null;

    if (!newPageFile) {
      return NextResponse.json({ error: "No page file provided to append." }, { status: 400 });
    }

    const newPageBuffer = Buffer.from(await newPageFile.arrayBuffer());
    const newPageMime = newPageFile.type;

    // Download existing file binary from storage provider
    const { provider } = await getProviderForDocument({
      id: document.id,
      storageProvider: document.storageProvider,
      storageFileId: document.storageFileId,
      ownerId: document.ownerId,
      folderId: document.folderId,
    });

    const existingBuffer = await provider.downloadFile(document.storageFileId);
    let updatedPdfBytes: Uint8Array;

    if (document.mimeType === "application/pdf") {
      if (newPageMime === "application/pdf") {
        updatedPdfBytes = await appendPagesToPdf(existingBuffer, [newPageBuffer]);
      } else {
        // Appending image to existing PDF
        updatedPdfBytes = await appendPagesToPdf(existingBuffer, [
          {
            data: newPageBuffer,
            mimeType: newPageMime.includes("png") ? "image/png" : "image/jpeg",
          },
        ]);
      }
    } else if (document.mimeType.startsWith("image/")) {
      // Document is currently an image; convert to multi-page PDF
      const initialPdf = await convertImageToPdf(
        existingBuffer,
        document.mimeType.includes("png") ? "image/png" : "image/jpeg",
      );

      if (newPageMime === "application/pdf") {
        updatedPdfBytes = await appendPagesToPdf(initialPdf, [newPageBuffer]);
      } else {
        updatedPdfBytes = await appendPagesToPdf(initialPdf, [
          {
            data: newPageBuffer,
            mimeType: newPageMime.includes("png") ? "image/png" : "image/jpeg",
          },
        ]);
      }
    } else {
      return NextResponse.json(
        { error: `Cannot append pages to document with MIME type: ${document.mimeType}` },
        { status: 400 },
      );
    }

    // Determine target filename (ensure .pdf if converting from image)
    const newFilename = document.name.toLowerCase().endsWith(".pdf")
      ? document.name
      : `${document.name.replace(/\.[^/.]+$/, "")}.pdf`;

    // Update file in Google Drive
    await provider.updateFileContent(document.storageFileId, {
      data: Buffer.from(updatedPdfBytes),
      mimeType: "application/pdf",
      filename: newFilename,
    });

    // Update Document in Prisma
    const updatedDocument = await prisma.document.update({
      where: { id: document.id },
      data: {
        mimeType: "application/pdf",
        name: newFilename,
        sizeBytes: updatedPdfBytes.length,
        updatedAt: new Date(),
      },
    });

    // Check if AI processing was requested/completed, and re-trigger if so
    const existingAi = await prisma.aiProcessing.findUnique({
      where: { documentId: document.id },
      select: { id: true, status: true },
    });

    let retriggeredAi = false;
    if (existingAi && existingAi.status !== "NOT_REQUESTED") {
      await ensureAiJobAndProcessing(document.id, GEMINI_MODEL);
      retriggeredAi = true;
    }

    // Log SyncEvent
    await prisma.syncEvent.create({
      data: {
        userId: user.id,
        provider: "GOOGLE_DRIVE",
        documentId: document.id,
        operation: "UPDATE",
        status: "SUCCESS",
        metadata: JSON.stringify({
          action: "append_page",
          addedMimeType: newPageMime,
          newSizeBytes: updatedPdfBytes.length,
          retriggeredAi,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Page successfully appended to document.",
      document: {
        id: updatedDocument.id,
        name: updatedDocument.name,
        mimeType: updatedDocument.mimeType,
        sizeBytes: updatedDocument.sizeBytes,
      },
      retriggeredAi,
    });
  } catch (error) {
    console.error("POST /api/documents/[id]/append-page error:", error);
    return NextResponse.json({ error: "Failed to append page." }, { status: 500 });
  }
}

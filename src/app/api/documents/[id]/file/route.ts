import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { checkDocumentAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getProviderForDocument, getProviderForUser } from "@/lib/storage/factory";
import { fetchEmailDocumentAttachment } from "@/lib/sync/email-attachment-fetcher";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const access = await checkDocumentAccess(user.id, id);
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "You do not have permission to access this document." },
        { status: 403 },
      );
    }

    const doc = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        mimeType: true,
        storageProvider: true,
        storageFileId: true,
        ownerId: true,
        folderId: true,
        sizeBytes: true,
        thumbnailUrl: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    let storageFileId = doc.storageFileId;

    // Self-healing: If document was imported from email but file has not yet been uploaded to Google Drive
    if (!storageFileId) {
      const emailDoc = await prisma.emailDocumentImport.findFirst({
        where: { importedDocumentId: doc.id },
      });
      if (emailDoc) {
        try {
          const attachment = await fetchEmailDocumentAttachment(
            doc.ownerId,
            emailDoc.sourceProvider as "GMAIL" | "OUTLOOK" | "FORWARDING",
            emailDoc.emailMessageId,
            emailDoc.filename,
          );
          if (attachment) {
            const { provider } = await getProviderForUser(doc.ownerId, "GOOGLE_DRIVE");
            const vaultyFolders = await provider.ensureVaultyFolders();
            const targetParentId = vaultyFolders.docs;
            const uploaded = await provider.uploadFile({
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              data: attachment.data,
              parentId: targetParentId,
            });
            await prisma.document.update({
              where: { id: doc.id },
              data: {
                storageProvider: "GOOGLE_DRIVE",
                storageFileId: uploaded.id,
                storageParentId: targetParentId,
                storageWebViewLink: uploaded.webViewLink || null,
                sizeBytes: attachment.data.length,
                mimeType: attachment.mimeType,
              },
            });
            storageFileId = uploaded.id;
          }
        } catch (recoveryErr) {
          console.warn("[document-file] Automatic email attachment recovery error:", recoveryErr);
        }
      }
    }

    if (doc.storageProvider === "GOOGLE_DRIVE" && storageFileId) {
      try {
        const { provider } = await getProviderForDocument({
          id: doc.id,
          storageProvider: doc.storageProvider,
          storageFileId: storageFileId,
          ownerId: doc.ownerId,
          folderId: doc.folderId,
        });

        const responseHeaders: Record<string, string> = {
          "Content-Type": doc.mimeType || "application/octet-stream",
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        };
        if (doc.sizeBytes && doc.sizeBytes > 0) {
          responseHeaders["Content-Length"] = String(doc.sizeBytes);
        }

        try {
          const stream = await provider.downloadFileStream(storageFileId);
          return new Response(stream, { headers: responseHeaders });
        } catch (streamErr) {
          console.warn(
            "[document-file] downloadFileStream failed, falling back to downloadFile buffer:",
            streamErr,
          );
          const buffer = await provider.downloadFile(storageFileId);
          responseHeaders["Content-Length"] = String(buffer.byteLength);
          return new Response(buffer as unknown as BodyInit, { headers: responseHeaders });
        }
      } catch (driveError: unknown) {
        console.error("Drive file fetch error:", driveError);
        const errObj = driveError as { code?: number | string; status?: number; message?: string };
        const isNotFound =
          errObj?.code === 404 ||
          errObj?.status === 404 ||
          errObj?.message?.toLowerCase().includes("file not found") ||
          errObj?.message?.toLowerCase().includes("notfound");

        const status = isNotFound ? 404 : 500;
        return NextResponse.json(
          {
            error: isNotFound
              ? "File not found on Google Drive. It may have been moved or deleted in Drive."
              : "Failed to fetch document from Google Drive.",
            code: isNotFound ? "DRIVE_FILE_NOT_FOUND" : "DRIVE_FETCH_ERROR",
          },
          { status },
        );
      }
    }

    // Fallback if file not yet uploaded to Drive but thumbnail data URL is present
    if (doc.thumbnailUrl && doc.thumbnailUrl.startsWith("data:")) {
      try {
        const commaIndex = doc.thumbnailUrl.indexOf(",");
        if (commaIndex !== -1) {
          const mimeMatch = doc.thumbnailUrl.substring(5, commaIndex).split(";")[0];
          const base64Data = doc.thumbnailUrl.substring(commaIndex + 1);
          const buffer = Buffer.from(base64Data, "base64");
          return new Response(buffer as unknown as BodyInit, {
            headers: {
              "Content-Type": mimeMatch || "image/jpeg",
              "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
              "Cache-Control": "private, max-age=3600",
            },
          });
        }
      } catch (thumbErr) {
        console.warn("[document-file] Failed to serve thumbnail data fallback:", thumbErr);
      }
    }

    return NextResponse.json({ error: "Document file not found." }, { status: 404 });
  } catch (error) {
    console.error("Error streaming document file:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving the document file." },
      { status: 500 },
    );
  }
}

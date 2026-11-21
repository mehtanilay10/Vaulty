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

        const stream = await provider.downloadFileStream(storageFileId);

        return new Response(stream, {
          headers: {
            "Content-Type": doc.mimeType,
            "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
            "Cache-Control": "private, no-store, max-age=0",
            Pragma: "no-cache",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (driveError) {
        console.error("Drive file fetch error:", driveError);
        return NextResponse.json(
          { error: "Failed to fetch document from Google Drive." },
          { status: 500 },
        );
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

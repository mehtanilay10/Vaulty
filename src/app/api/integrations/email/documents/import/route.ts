import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { validateCSRFRequest } from "@/lib/csrf";
import {
  fetchEmailDocumentAttachment,
  uploadEmailDocumentToDrive,
} from "@/lib/sync/email-attachment-fetcher";
import { StorageConnectionStatus } from "@prisma/client";
import { z } from "zod";

const importSchema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
  folderId: z.string().optional(),
  folderMapping: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    // Verify Google Drive connection is active for storing documents
    const driveConnection = await prisma.storageConnection.findFirst({
      where: {
        userId: user.id,
        provider: "GOOGLE_DRIVE",
        status: StorageConnectionStatus.CONNECTED,
      },
    });

    if (!driveConnection) {
      return NextResponse.json(
        {
          error:
            "Google Drive is not connected. Please connect your Google Drive in Settings before importing documents.",
        },
        { status: 400 },
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = importSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const { id, ids, all, folderId, folderMapping } = parsed.data;

    let targetFolderId = folderId;
    if (targetFolderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: targetFolderId, ownerId: user.id },
      });
      if (!folder) targetFolderId = undefined;
    }

    if (!targetFolderId) {
      // Find or create default root folder
      let rootFolder = await prisma.folder.findFirst({
        where: { ownerId: user.id, parentId: null },
      });
      if (!rootFolder) {
        rootFolder = await prisma.folder.create({
          data: {
            name: "Documents",
            ownerId: user.id,
          },
        });
      }
      targetFolderId = rootFolder.id;
    }

    const candidateFilter = all
      ? {}
      : ids && ids.length > 0
        ? { id: { in: ids } }
        : { id: id ? id : "" };

    const candidates = await prisma.emailDocumentImport.findMany({
      where: {
        ownerId: user.id,
        status: "PENDING",
        ...candidateFilter,
      },
      take: 100,
    });

    if (candidates.length === 0) {
      return NextResponse.json({ error: "No pending documents found to import." }, { status: 404 });
    }

    const importedDocs: Array<{ id: string; name: string }> = [];

    for (const item of candidates) {
      // Fetch attachment from email provider
      const attachmentData = await fetchEmailDocumentAttachment(
        user.id,
        item.sourceProvider as "GMAIL" | "OUTLOOK" | "FORWARDING",
        item.emailMessageId,
        item.filename,
      );

      const specificFolderId = (folderMapping && folderMapping[item.id]) || targetFolderId;

      // Upload to Google Drive and create document record
      const uploadedDoc = await uploadEmailDocumentToDrive({
        userId: user.id,
        folderId: specificFolderId,
        documentTitle: item.documentTitle,
        filename: item.filename,
        mimeType: item.mimeType,
        expiryDate: item.expiryDate,
        attachmentData,
        emailDetails: {
          subject: item.subject,
          fromAddress: item.fromAddress,
          receivedAt: item.receivedAt,
          extractedSummary: item.extractedSummary,
        },
      });

      await prisma.emailDocumentImport.update({
        where: { id: item.id },
        data: {
          status: "IMPORTED",
          importedDocumentId: uploadedDoc.documentId,
          importedAt: new Date(),
        },
      });

      if (item.sourceProvider === "FORWARDING") {
        await prisma.inboundEmailAttachment
          .deleteMany({
            where: {
              userId: user.id,
              emailMessageId: {
                in: [item.emailMessageId, item.emailMessageId.replace(/^forwarding:/i, "")],
              },
            },
          })
          .catch(() => {});
      }

      importedDocs.push({ id: uploadedDoc.documentId, name: uploadedDoc.name });
    }

    await createAuditLog({
      userId: user.id,
      action: "EMAIL_DOCUMENT_IMPORT",
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
      metadata: {
        importedCount: importedDocs.length,
        documentIds: importedDocs.map((d) => d.id),
      },
    });

    return NextResponse.json({
      success: true,
      count: importedDocs.length,
      documents: importedDocs,
    });
  } catch (error) {
    console.error("POST /api/integrations/email/documents/import error:", error);
    return NextResponse.json({ error: "Failed to import documents." }, { status: 500 });
  }
}

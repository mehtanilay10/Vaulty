import { prisma } from "@/lib/prisma";
import { createAuthorizedGmail, decryptGmailRefreshToken } from "@/lib/gmail/oauth";
import { refreshOutlookAccessToken, getOutlookPdfAttachments } from "@/lib/outlook/oauth";
import { getProviderForUser } from "@/lib/storage/factory";
import { ensureAiJobAndProcessing } from "@/lib/ai/job-service";
import { GEMINI_MODEL } from "@/lib/gemini";

export interface EmailAttachmentData {
  filename: string;
  mimeType: string;
  data: Buffer;
}

/**
 * Fetch document attachment from Gmail or Outlook for an email message.
 */
export async function fetchEmailDocumentAttachment(
  userId: string,
  sourceProvider: "GMAIL" | "OUTLOOK" | "FORWARDING",
  emailMessageId: string,
  preferredFilename?: string | null,
): Promise<EmailAttachmentData | null> {
  const cleanMessageId = emailMessageId.replace(/^(outlook|gmail|forwarding|inbound):/i, "");

  if (sourceProvider === "FORWARDING") {
    const staged = await prisma.inboundEmailAttachment.findFirst({
      where: {
        userId,
        emailMessageId: { in: [emailMessageId, cleanMessageId] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (staged) {
      return {
        filename: staged.filename || preferredFilename || "document.pdf",
        mimeType: staged.mimeType || "application/pdf",
        data: Buffer.from(staged.data),
      };
    }
    return null;
  }

  if (sourceProvider === "OUTLOOK") {
    const connection = await prisma.outlookConnection.findUnique({
      where: { ownerId: userId },
    });
    if (!connection) {
      console.warn(`[email-attachment-fetcher] Outlook connection not found for user ${userId}`);
      return null;
    }

    try {
      const refreshed = await refreshOutlookAccessToken(connection.refreshTokenEncrypted);
      const attachments = await getOutlookPdfAttachments(refreshed.accessToken, cleanMessageId);

      if (attachments.length > 0) {
        const first = attachments[0];
        return {
          filename: first.filename || preferredFilename || "document.pdf",
          mimeType: first.mimeType || "application/pdf",
          data: first.data,
        };
      }
    } catch (err) {
      console.error("[email-attachment-fetcher] Failed to fetch Outlook attachment:", err);
    }
  } else if (sourceProvider === "GMAIL") {
    const connection = await prisma.gmailConnection.findUnique({
      where: { ownerId: userId },
    });
    if (!connection) {
      console.warn(`[email-attachment-fetcher] Gmail connection not found for user ${userId}`);
      return null;
    }

    try {
      const refreshToken = decryptGmailRefreshToken(connection.refreshTokenEncrypted);
      const { gmail } = createAuthorizedGmail(refreshToken);
      const response = await gmail.users.messages.get({
        userId: "me",
        id: cleanMessageId,
        format: "full",
      });

      const attachments: EmailAttachmentData[] = [];
      const visit = async (part: NonNullable<typeof response.data.payload>) => {
        const filename = part.filename || "";
        const mimeType = part.mimeType || "";
        const attachmentId = part.body?.attachmentId;
        const isPdf =
          filename.toLowerCase().endsWith(".pdf") || mimeType.toLowerCase() === "application/pdf";
        if (isPdf && Number(part.body?.size || 0) <= 20 * 1024 * 1024) {
          if (attachmentId) {
            const item = await gmail.users.messages.attachments.get({
              userId: "me",
              messageId: cleanMessageId,
              id: attachmentId,
            });
            if (item.data.data) {
              const data = Buffer.from(item.data.data, "base64url");
              if (data.length <= 20 * 1024 * 1024) {
                attachments.push({
                  filename: filename || preferredFilename || "document.pdf",
                  mimeType: "application/pdf",
                  data,
                });
              }
            }
          } else if (part.body?.data) {
            const data = Buffer.from(part.body.data, "base64url");
            if (data.length <= 20 * 1024 * 1024) {
              attachments.push({
                filename: filename || preferredFilename || "document.pdf",
                mimeType: "application/pdf",
                data,
              });
            }
          }
        }
        for (const child of part.parts || []) {
          await visit(child);
        }
      };

      if (response.data.payload) {
        await visit(response.data.payload);
      }

      if (attachments.length > 0) {
        return attachments[0];
      }
    } catch (err) {
      console.error("[email-attachment-fetcher] Failed to fetch Gmail attachment:", err);
    }
  }

  return null;
}

/**
 * Creates a minimal valid PDF-1.4 file buffer containing text.
 * Used when an email contains important document information but no binary attachment.
 */
export function createDocumentSummaryPdf(title: string, lines: string[]): Buffer {
  const content = [
    `%PDF-1.4`,
    `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`,
    `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`,
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj`,
    `5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`,
  ];

  const streamLines: string[] = [
    "BT",
    "/F1 16 Tf",
    "50 720 Td",
    `(${title.replace(/[()\\]/g, "\\$&")}) Tj`,
    "/F1 10 Tf",
    "0 -30 Td",
  ];

  for (const line of lines.slice(0, 40)) {
    const sanitized = line.replace(/[()\\]/g, "\\$&");
    streamLines.push(`(${sanitized}) Tj`, "0 -15 Td");
  }
  streamLines.push("ET");

  const streamContent = streamLines.join("\n");
  content.push(
    `4 0 obj << /Length ${Buffer.byteLength(streamContent, "utf8")} >> stream\n${streamContent}\nendstream\nendobj`,
  );

  const xref: string[] = ["xref", "0 6", "0000000000 65535 f "];
  const body = content.join("\n") + "\n";

  // Calculate xref offsets
  const objMatches = [...body.matchAll(/\d+ 0 obj/g)];
  for (const match of objMatches) {
    xref.push(String(match.index).padStart(10, "0") + " 00000 n ");
  }

  const trailer = `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF`;
  return Buffer.from(body + xref.join("\n") + "\n" + trailer, "utf8");
}

/**
 * Uploads an attachment or document PDF to the user's Google Drive and creates the Document record in Prisma.
 */
export async function uploadEmailDocumentToDrive(options: {
  userId: string;
  folderId?: string;
  documentTitle: string;
  filename?: string | null;
  mimeType?: string | null;
  expiryDate?: Date | null;
  attachmentData?: EmailAttachmentData | null;
  emailDetails?: {
    subject?: string | null;
    fromAddress: string;
    receivedAt: Date;
    extractedSummary?: string | null;
  };
}): Promise<{
  documentId: string;
  name: string;
  storageFileId: string;
  webViewLink: string | null;
}> {
  const { provider } = await getProviderForUser(options.userId, "GOOGLE_DRIVE");
  const vaultyFolders = await provider.ensureVaultyFolders();
  let targetDriveParentId = vaultyFolders.docs;

  let targetFolderId = options.folderId;
  if (targetFolderId) {
    const vaultyFolder = await prisma.folder.findUnique({
      where: { id: targetFolderId },
      select: { storageFolderId: true },
    });
    if (vaultyFolder?.storageFolderId) {
      targetDriveParentId = vaultyFolder.storageFolderId;
    }
  } else {
    let rootFolder = await prisma.folder.findFirst({
      where: { ownerId: options.userId, parentId: null },
    });
    if (!rootFolder) {
      rootFolder = await prisma.folder.create({
        data: { name: "Documents", ownerId: options.userId },
      });
    }
    targetFolderId = rootFolder.id;
  }

  let fileBuffer: Buffer;
  let finalFilename: string;
  let finalMimeType: string;

  if (options.attachmentData) {
    fileBuffer = options.attachmentData.data;
    finalFilename =
      options.filename || options.attachmentData.filename || `${options.documentTitle}.pdf`;
    finalMimeType = options.attachmentData.mimeType || "application/pdf";
  } else {
    // Generate clean summary PDF if email had no binary attachment
    const lines = [
      `Sender: ${options.emailDetails?.fromAddress || "Unknown"}`,
      `Date: ${options.emailDetails?.receivedAt ? options.emailDetails.receivedAt.toLocaleDateString() : new Date().toLocaleDateString()}`,
      `Subject: ${options.emailDetails?.subject || "Document Notice"}`,
      "",
      ...(options.emailDetails?.extractedSummary
        ? options.emailDetails.extractedSummary.split("\n")
        : ["No preview text available."]),
    ];
    fileBuffer = createDocumentSummaryPdf(options.documentTitle, lines);
    finalFilename = `${options.documentTitle}.pdf`;
    finalMimeType = "application/pdf";
  }

  const uploaded = await provider.uploadFile({
    filename: finalFilename,
    mimeType: finalMimeType,
    data: fileBuffer,
    parentId: targetDriveParentId,
  });

  const doc = await prisma.document.create({
    data: {
      name: options.documentTitle || finalFilename,
      mimeType: finalMimeType,
      sizeBytes: fileBuffer.length,
      folderId: targetFolderId,
      ownerId: options.userId,
      storageProvider: "GOOGLE_DRIVE",
      storageFileId: uploaded.id,
      storageParentId: targetDriveParentId,
      storageWebViewLink: uploaded.webViewLink || null,
      expiryDate: options.expiryDate || null,
    },
  });

  try {
    await ensureAiJobAndProcessing(doc.id, GEMINI_MODEL);
  } catch (err) {
    console.warn("[uploadEmailDocumentToDrive] AI processing trigger error:", err);
  }

  return {
    documentId: doc.id,
    name: doc.name,
    storageFileId: uploaded.id,
    webViewLink: uploaded.webViewLink || null,
  };
}

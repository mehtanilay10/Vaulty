import { prisma } from "@/lib/prisma";
import { processFinancialPdfAttachments } from "@/lib/email-statement-attachments";
import {
  classifyMultiModuleBatch,
  type MultiModuleClassificationResult,
} from "@/lib/sync/classify-multi-module-emails";
import { createAuditLog } from "@/lib/audit-log";
import { createNotification } from "@/lib/notifications";
import { cleanAddress } from "@/lib/sync/email-sync-engine";

export interface InboundEmailAttachmentInput {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface InboundEmailPayload {
  userId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  messageId: string;
  receivedAt?: Date;
  attachments?: InboundEmailAttachmentInput[];
}

export interface InboundEmailProcessingResult {
  userId: string;
  messageId: string;
  attachmentsSaved: number;
  transactionsExtracted: number;
  documentsDiscovered: number;
  remindersDiscovered: number;
}

/**
 * Resolves a Vaulty user from an inbound recipient address.
 * Matches by inboundEmailToken, inboundEmailSlug, or user's email username.
 */
export async function resolveUserForInboundEmail(
  recipientAddress: string,
  senderAddress?: string,
): Promise<{ id: string; email: string | null; name: string | null } | null> {
  const cleanedRecipient = cleanAddress(recipientAddress).toLowerCase();
  const [localPart] = cleanedRecipient.split("@");
  if (!localPart) return null;

  // 1. Check if recipient has a plus/dot tag e.g. "username+a8f3b2" or "username.a8f3b2"
  const [baseUsername, tag] = localPart.split(/[+.]/);

  // 2. Direct lookup by inboundEmailToken (token could be in tag or full localPart)
  let user = null;
  if (tag) {
    user = await prisma.user.findFirst({
      where: {
        inboundEmailToken: tag,
        inboundEmailEnabled: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        inboundAllowedSenders: true,
        inboundEmailEnabled: true,
      },
    });
  }

  if (!user) {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { inboundEmailToken: localPart },
          { inboundEmailSlug: baseUsername },
          { inboundEmailSlug: localPart },
        ],
        inboundEmailEnabled: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        inboundAllowedSenders: true,
        inboundEmailEnabled: true,
      },
    });
  }

  // 3. Fallback: match by the local part of user's registered email
  if (!user && baseUsername) {
    const candidateUsers = await prisma.user.findMany({
      where: {
        email: { startsWith: `${baseUsername}@`, mode: "insensitive" },
        inboundEmailEnabled: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        inboundAllowedSenders: true,
        inboundEmailEnabled: true,
      },
      take: 2,
    });

    if (candidateUsers.length === 1) {
      user = candidateUsers[0];
    }
  }

  if (!user) return null;

  // 4. Sender whitelist verification
  if (senderAddress && user.inboundAllowedSenders && user.inboundAllowedSenders.length > 0) {
    const cleanedSender = cleanAddress(senderAddress).toLowerCase();
    const isAllowed = user.inboundAllowedSenders.some(
      (allowed) => allowed.trim().toLowerCase() === cleanedSender,
    );
    if (!isAllowed) {
      console.warn(
        `[inbound-email] Dropping email for user ${user.id}: sender "${cleanedSender}" not in allowed forwarders list`,
      );
      return null;
    }
  }

  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Processes an inbound forwarded email: stages attachments, decrypts password-protected PDFs,
 * extracts transactions, and runs multi-module AI classification for documents and reminders.
 */
export async function processInboundEmail(
  payload: InboundEmailPayload,
): Promise<InboundEmailProcessingResult> {
  const {
    userId,
    from,
    subject,
    textBody,
    messageId,
    receivedAt = new Date(),
    attachments = [],
  } = payload;

  const syntheticMessageId = messageId.startsWith("inbound:")
    ? messageId
    : `inbound:${messageId}`.slice(0, 190);

  // 1. Stage attachments in database for user review & Google Drive import
  let attachmentsSaved = 0;
  for (let index = 0; index < attachments.length; index++) {
    const att = attachments[index];
    const safeFilename = (att.filename || `attachment_${index + 1}.pdf`).slice(0, 255);
    const safeMime = (att.mimeType || "application/octet-stream").slice(0, 128);

    await prisma.inboundEmailAttachment.create({
      data: {
        userId,
        emailMessageId: syntheticMessageId,
        filename: safeFilename,
        mimeType: safeMime,
        sizeBytes: att.data.length,
        data: new Uint8Array(att.data),
      },
    });
    attachmentsSaved++;
  }

  // 2. Financial PDF Password Decryption & Wealth Transactions Extraction
  const pdfAttachments = attachments.filter(
    (att) =>
      att.mimeType.toLowerCase() === "application/pdf" ||
      att.filename.toLowerCase().endsWith(".pdf"),
  );

  let transactionsExtracted = 0;
  if (pdfAttachments.length > 0) {
    try {
      const statementResult = await processFinancialPdfAttachments(
        {
          ownerId: userId,
          provider: "FORWARDING",
          messageId: syntheticMessageId,
          from,
          subject,
          body: textBody,
          receivedAt,
        },
        pdfAttachments.map((att, idx) => ({
          id: `pdf-${idx}`,
          filename: att.filename,
          mimeType: att.mimeType,
          data: att.data,
        })),
      );
      transactionsExtracted = statementResult.added;
    } catch (err) {
      console.warn("[inbound-email] Financial PDF processing error:", err);
    }
  }

  // 3. Multi-Module AI Classification (Documents & Reminders)
  let documentsDiscovered = 0;
  let remindersDiscovered = 0;

  try {
    const classification: MultiModuleClassificationResult = await classifyMultiModuleBatch([
      {
        messageId: syntheticMessageId,
        from,
        subject,
        body: textBody,
        receivedAt,
      },
    ]);

    // Stage discovered documents
    for (const doc of classification.documents) {
      const matchingAttachment =
        attachments.find((a) => a.filename === doc.filename) || attachments[0];

      await prisma.emailDocumentImport.create({
        data: {
          ownerId: userId,
          emailMessageId: syntheticMessageId,
          sourceProvider: "FORWARDING",
          fromAddress: from.slice(0, 320),
          subject: subject.slice(0, 500),
          receivedAt,
          documentTitle: doc.documentTitle.slice(0, 240),
          documentType: doc.documentType,
          filename:
            doc.filename?.slice(0, 255) || matchingAttachment?.filename?.slice(0, 255) || null,
          mimeType:
            doc.mimeType?.slice(0, 128) || matchingAttachment?.mimeType?.slice(0, 128) || null,
          fileSizeBytes: doc.fileSizeBytes || matchingAttachment?.data.length || 0,
          extractedSummary: doc.reason || null,
          expiryDate: doc.expiryDate,
          aiConfidence: doc.confidence,
          aiReason: doc.reason,
          status: "PENDING",
        },
      });
      documentsDiscovered++;
    }

    // Stage discovered reminders
    for (const rem of classification.reminders) {
      await prisma.emailReminderImport.create({
        data: {
          ownerId: userId,
          emailMessageId: syntheticMessageId,
          sourceProvider: "FORWARDING",
          fromAddress: from.slice(0, 320),
          subject: subject.slice(0, 500),
          receivedAt,
          title: rem.title.slice(0, 240),
          description: rem.description,
          category: rem.category,
          dueAt: rem.dueAt,
          amount: rem.amount,
          currency: rem.currency || "INR",
          aiConfidence: rem.confidence,
          aiReason: rem.reason,
          status: "PENDING",
        },
      });
      remindersDiscovered++;
    }
  } catch (err) {
    console.warn("[inbound-email] Multi-module classification error:", err);
  }

  // 4. Audit Log
  await createAuditLog({
    userId,
    action: "INBOUND_EMAIL_PROCESSED",
    metadata: {
      from,
      subject: subject.slice(0, 100),
      attachmentsCount: attachments.length,
      transactionsExtracted,
      documentsDiscovered,
      remindersDiscovered,
    },
  });

  // 5. In-App Notification if items were staged
  const summaryParts: string[] = [];
  if (transactionsExtracted > 0) summaryParts.push(`${transactionsExtracted} transaction(s)`);
  if (documentsDiscovered > 0) summaryParts.push(`${documentsDiscovered} document(s)`);
  if (remindersDiscovered > 0) summaryParts.push(`${remindersDiscovered} reminder(s)`);

  if (summaryParts.length > 0) {
    try {
      await createNotification({
        userId,
        type: "WEALTH_TRANSACTION_PENDING_REVIEW",
        title: "Inbound Email Staged",
        message: `Forwarded email "${subject.slice(0, 40)}" parsed: ${summaryParts.join(", ")} ready for review.`,
      });
    } catch {
      // Notification creation is non-blocking
    }
  }

  return {
    userId,
    messageId: syntheticMessageId,
    attachmentsSaved,
    transactionsExtracted,
    documentsDiscovered,
    remindersDiscovered,
  };
}

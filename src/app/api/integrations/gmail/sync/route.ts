import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAuthorizedGmail, decryptGmailRefreshToken } from "@/lib/gmail/oauth";
import { validateCSRFRequest } from "@/lib/csrf";
import { extractGmailMessageText } from "@/lib/gmail/parse-transaction-email";
import { type GmailEmailForClassification } from "@/lib/gmail/classify-transaction-emails";
import {
  classifyMultiModuleBatch,
  rankMultiModuleEmails,
  type MultiModuleClassificationResult,
} from "@/lib/sync/classify-multi-module-emails";
import { type ReminderCategory, Prisma } from "@prisma/client";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { consumeSecurityAttempt } from "@/lib/security-rate-limit";
import { removeDuplicateTransactions } from "@/lib/gmail/dedupe-transactions";
import { areDuplicateDocuments, areDuplicateReminders } from "@/lib/sync/dedupe-email-items";
import {
  extractAccountLastFour,
  extractAccountNumberHint,
  matchFinancialAccount,
} from "@/lib/gmail/account-matching";
import { processFinancialPdfAttachments } from "@/lib/email-statement-attachments";
import { z } from "zod";

const gmailSyncSchema = z.object({
  lookbackDays: z.coerce
    .number()
    .int("Choose a sync window between 2 and 180 days.")
    .min(2, "Choose a sync window between 2 and 180 days.")
    .max(180, "Choose a sync window between 2 and 180 days.")
    .default(7),
  continuePage: z.boolean().optional().default(false),
});

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  name: string,
) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function cleanAddress(value: string): string {
  if (typeof value !== "string") return "unknown";
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  const match = trimmed.match(/<([^>]+)>/);
  const candidate = (match ? match[1] : trimmed).trim();
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (candidate.length <= 320 && emailRegex.test(candidate)) {
    return candidate;
  }
  return candidate.replace(/[\r\n\x00]/g, "").slice(0, 320) || "unknown";
}

async function loadEmailBatch(
  gmail: ReturnType<typeof createAuthorizedGmail>["gmail"],
  messageIds: string[],
) {
  const emails: GmailEmailForClassification[] = [];
  for (let offset = 0; offset < messageIds.length; offset += 10) {
    const fetched = await Promise.all(
      messageIds.slice(offset, offset + 10).map(async (messageId) => {
        const response = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });
        const message = response.data;
        const headers = message.payload?.headers;
        const receivedAt = new Date(Number(message.internalDate || Date.now()));
        return {
          messageId,
          threadId: message.threadId || null,
          from: headerValue(headers, "from"),
          subject: headerValue(headers, "subject").slice(0, 500),
          body:
            extractGmailMessageText(
              message.payload as Parameters<typeof extractGmailMessageText>[0],
            ) ||
            message.snippet ||
            "",
          receivedAt,
        } satisfies GmailEmailForClassification;
      }),
    );
    emails.push(...fetched);
  }
  return emails;
}

async function loadPdfAttachments(
  gmail: ReturnType<typeof createAuthorizedGmail>["gmail"],
  messageId: string,
) {
  const response = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const attachments: Array<{ id: string; filename: string; mimeType: string; data: Buffer }> = [];
  const visit = async (part: NonNullable<typeof response.data.payload>) => {
    const filename = part.filename || "";
    const mimeType = part.mimeType || "";
    const attachmentId = part.body?.attachmentId;
    if (
      (filename.toLowerCase().endsWith(".pdf") || mimeType.toLowerCase() === "application/pdf") &&
      Number(part.body?.size || 0) <= 20 * 1024 * 1024
    ) {
      if (attachmentId) {
        const item = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: attachmentId,
        });
        if (item.data.data) {
          const data = Buffer.from(item.data.data, "base64url");
          if (data.length <= 20 * 1024 * 1024)
            attachments.push({
              id: attachmentId,
              filename: filename || "statement.pdf",
              mimeType: "application/pdf",
              data,
            });
        }
      } else if (part.body?.data) {
        const data = Buffer.from(part.body.data, "base64url");
        if (data.length <= 20 * 1024 * 1024)
          attachments.push({
            id: `${messageId}-inline-${attachments.length}`,
            filename: filename || "statement.pdf",
            mimeType: "application/pdf",
            data,
          });
      }
    }
    for (const child of part.parts || []) await visit(child);
  };
  if (response.data.payload) await visit(response.data.payload);
  return attachments;
}

async function classifyMultiInBatches(emails: GmailEmailForClassification[]) {
  const result: MultiModuleClassificationResult = {
    transactions: [],
    documents: [],
    reminders: [],
  };
  for (let offset = 0; offset < emails.length; offset += 15) {
    const batch = await classifyMultiModuleBatch(emails.slice(offset, offset + 15), {
      logPrefix: "[GMAIL-SYNC]",
    });
    result.transactions.push(...batch.transactions);
    result.documents.push(...batch.documents);
    result.reminders.push(...batch.reminders);
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });

    const rate = await consumeSecurityAttempt({
      key: `gmail-sync:${user.id}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many Gmail sync requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds || 900) } },
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parseResult = gmailSyncSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error:
            parseResult.error.issues[0]?.message || "Choose a sync window between 7 and 180 days.",
        },
        { status: 400 },
      );
    }
    const { lookbackDays, continuePage } = parseResult.data;

    const connection = await prisma.gmailConnection.findUnique({ where: { ownerId: user.id } });
    if (!connection || connection.status !== "CONNECTED") {
      return NextResponse.json(
        { error: "Connect Gmail before syncing transactions." },
        { status: 409 },
      );
    }

    let refreshToken: string;
    try {
      refreshToken = decryptGmailRefreshToken(connection.refreshTokenEncrypted);
    } catch (decryptError) {
      console.error("Gmail sync token decryption error:", decryptError);
      await prisma.gmailConnection.updateMany({
        where: { ownerId: user.id },
        data: { status: "RECONNECT_REQUIRED" },
      });
      return NextResponse.json(
        { error: "Gmail needs to be reconnected. Token decryption failed." },
        { status: 502 },
      );
    }
    // Validate refresh token before using it
    if (!refreshToken || typeof refreshToken !== "string" || !refreshToken.trim()) {
      return NextResponse.json(
        { error: "Invalid Gmail refresh token. Please reconnect Gmail." },
        { status: 502 },
      );
    }
    const { gmail } = createAuthorizedGmail(refreshToken);
    const query = `newer_than:${lookbackDays}d -in:sent`;
    const shouldContinue = continuePage === true && connection.syncLookbackDays === lookbackDays;

    const messageIds: string[] = [];
    let pageToken: string | undefined =
      shouldContinue && connection.syncPageToken ? connection.syncPageToken : undefined;
    let nextPageToken: string | null = null;
    const MAX_GMAIL_EMAILS_PER_SYNC = 100;

    do {
      const list = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: Math.min(50, MAX_GMAIL_EMAILS_PER_SYNC - messageIds.length),
        ...(pageToken ? { pageToken } : {}),
      });

      const pageIds = (list.data.messages || [])
        .map((message) => message.id)
        .filter((id): id is string => Boolean(id));

      messageIds.push(...pageIds);
      nextPageToken = list.data.nextPageToken || null;
      pageToken = list.data.nextPageToken || undefined;

      // If continuing an explicit page, fetch one page. Otherwise gather the full lookback window.
      if (shouldContinue) break;
    } while (pageToken && messageIds.length < MAX_GMAIL_EMAILS_PER_SYNC);

    // Process all matching emails in this sync window (up to MAX_GMAIL_EMAILS_PER_SYNC)
    const existing = messageIds.length
      ? await prisma.emailTransactionImport.findMany({
          where: { ownerId: user.id, emailMessageId: { in: messageIds } },
          select: { id: true, emailMessageId: true, status: true, aiClassifiedAt: true },
        })
      : [];
    const existingById = new Map(existing.map((item) => [item.emailMessageId, item]));
    const legacyPendingByMessageId = new Map(
      existing
        .filter((item) => item.status === "PENDING" && item.aiClassifiedAt === null)
        .map((item) => [item.emailMessageId, item]),
    );
    const messageIdsToClassify = messageIds.filter((id) => {
      const prior = existingById.get(id);
      return !prior || legacyPendingByMessageId.has(id);
    });
    const fetchedEmails = await loadEmailBatch(gmail, messageIds);
    const emails = rankMultiModuleEmails(fetchedEmails, MAX_GMAIL_EMAILS_PER_SYNC);
    const classifyIds = new Set(messageIdsToClassify);
    const emailsToClassify = emails.filter((email) => classifyIds.has(email.messageId));

    // Statement PDFs are downloaded only for the locally selected financial emails.
    // PDF contents and password candidates remain server-side and are never sent to Gemini.
    let statementAttachmentStats = {
      attachments: 0,
      extracted: 0,
      added: 0,
      duplicates: 0,
      failed: 0,
    };
    // Rate limit PDF processing to prevent excessive API quota usage
    const maxPdfsPerSync = 10;
    let pdfsProcessed = 0;
    for (const email of emails) {
      if (
        !/(statement|e-statement|account summary|transaction summary|monthly report)/i.test(
          `${email.subject} ${email.body.slice(0, 1200)}`,
        )
      )
        continue;
      if (pdfsProcessed >= maxPdfsPerSync) {
        console.warn(
          `Gmail sync: Reached PDF processing limit (${maxPdfsPerSync}), skipping remaining PDFs.`,
        );
        break;
      }
      const attachments = await loadPdfAttachments(gmail, email.messageId);
      if (attachments.length > 0) {
        pdfsProcessed += 1;
        const result = await processFinancialPdfAttachments(
          {
            ownerId: user.id,
            provider: "GMAIL",
            messageId: email.messageId,
            threadId: email.threadId,
            from: email.from,
            subject: email.subject,
            body: email.body,
            receivedAt: email.receivedAt,
          },
          attachments,
        );
        statementAttachmentStats = {
          attachments: statementAttachmentStats.attachments + result.attachments,
          extracted: statementAttachmentStats.extracted + result.extracted,
          added: statementAttachmentStats.added + result.added,
          duplicates: statementAttachmentStats.duplicates + result.duplicates,
          failed: statementAttachmentStats.failed + result.failed,
        };
      }
    }

    let multiResult: MultiModuleClassificationResult = {
      transactions: [],
      documents: [],
      reminders: [],
    };
    try {
      multiResult = await classifyMultiInBatches(emailsToClassify);
    } catch (classifyError) {
      console.error("Gmail sync classification error:", classifyError);
      // Do not commit any partial results - classification must be atomic
      return NextResponse.json(
        {
          error:
            classifyError instanceof Error
              ? classifyError.message
              : "Failed to classify emails with Gemini.",
        },
        { status: 502 },
      );
    }
    const classified = multiResult.transactions;
    const classifiedById = new Map(classified.map((item) => [item.messageId, item]));
    const emailById = new Map(emailsToClassify.map((email) => [email.messageId, email]));

    const financialAccounts = await prisma.wealthAccount.findMany({
      where: { ownerId: user.id, status: "ACTIVE" },
      select: { id: true, name: true, bankName: true, provider: true, accountNumber: true },
    });
    const candidates = classified.flatMap((item) => {
      if (existingById.has(item.messageId)) return [];
      const email = emailById.get(item.messageId);
      if (!email) return [];
      return [
        {
          ownerId: user.id,
          emailMessageId: item.messageId,
          threadId: email.threadId || null,
          fromAddress: cleanAddress(email.from) || "unknown",
          subject: email.subject || null,
          accountId: matchFinancialAccount(
            financialAccounts,
            item.bankName,
            extractAccountLastFour(`${email.subject}\n${email.body}`),
            extractAccountNumberHint(`${email.subject}\n${email.body}`),
          ),
          bankName: item.bankName,
          merchant: item.merchant,
          description: item.description,
          amount: item.amount,
          currency: item.currency,
          type: item.type,
          referenceNumber: item.referenceNumber,
          date: item.date,
          aiConfidence: item.confidence,
          aiReason: item.reason,
          aiClassifiedAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    });

    const [reviewDuplicates, savedTransactions] = await Promise.all([
      prisma.emailTransactionImport.findMany({
        where: { ownerId: user.id, status: { in: ["PENDING", "IMPORTED"] } },
        select: {
          amount: true,
          currency: true,
          type: true,
          date: true,
          referenceNumber: true,
          bankName: true,
          merchant: true,
          description: true,
        },
      }),
      prisma.wealthTransaction.findMany({
        where: { account: { ownerId: user.id } },
        select: {
          amount: true,
          currency: true,
          type: true,
          date: true,
          referenceNumber: true,
          description: true,
          account: { select: { bankName: true, name: true } },
        },
      }),
    ]);
    const fingerprints = [
      ...reviewDuplicates,
      ...savedTransactions.map((item) => ({
        ...item,
        bankName: item.account.bankName || item.account.name,
      })),
    ];
    const uniqueCandidates = removeDuplicateTransactions(candidates, fingerprints);

    // Wrap all database updates in a single transaction to ensure atomicity
    const { insertedCount, legacyRemoved, legacyUpdated, updatedConnection } =
      await prisma.$transaction(async (tx) => {
        let removedCount = 0;
        let updatedCount = 0;
        for (const [messageId, legacy] of legacyPendingByMessageId) {
          const item = classifiedById.get(messageId);
          if (!item) {
            const removed = await tx.emailTransactionImport.deleteMany({
              where: { id: legacy.id, ownerId: user.id, status: "PENDING", aiClassifiedAt: null },
            });
            removedCount += removed.count;
            continue;
          }
          await tx.emailTransactionImport.updateMany({
            where: { id: legacy.id, ownerId: user.id, status: "PENDING", aiClassifiedAt: null },
            data: {
              bankName: item.bankName,
              merchant: item.merchant,
              description: item.description,
              amount: item.amount,
              currency: item.currency,
              type: item.type,
              referenceNumber: item.referenceNumber,
              date: item.date,
              aiConfidence: item.confidence,
              aiReason: item.reason,
              aiClassifiedAt: new Date(),
            },
          });
          updatedCount += 1;
        }

        const inserted = uniqueCandidates.length
          ? await tx.emailTransactionImport.createMany({
              data: uniqueCandidates,
              skipDuplicates: true,
            })
          : { count: 0 };

        const conn = await tx.gmailConnection.update({
          where: { ownerId: user.id },
          data: {
            lastSyncedAt: new Date(),
            status: "CONNECTED",
            syncPageToken: nextPageToken || null,
            syncLookbackDays: nextPageToken ? lookbackDays : null,
          },
          select: { emailAddress: true, status: true, lastSyncedAt: true, syncLookbackDays: true },
        });

        return {
          insertedCount: inserted.count,
          legacyRemoved: removedCount,
          legacyUpdated: updatedCount,
          updatedConnection: conn,
        };
      });

    // Pre-load existing pending/imported records to prevent duplicate candidate creation
    const existingDocs = await prisma.emailDocumentImport.findMany({
      where: { ownerId: user.id, status: { in: ["PENDING", "IMPORTED"] } },
      select: {
        id: true,
        emailMessageId: true,
        documentTitle: true,
        documentType: true,
        receivedAt: true,
        aiConfidence: true,
      },
      take: 200,
    });

    const existingRems = await prisma.emailReminderImport.findMany({
      where: { ownerId: user.id, status: { in: ["PENDING", "IMPORTED"] } },
      select: {
        id: true,
        emailMessageId: true,
        title: true,
        dueAt: true,
        amount: true,
        aiConfidence: true,
      },
      take: 200,
    });

    const docsToCreate = [];
    for (const doc of multiResult.documents) {
      const email = emailById.get(doc.messageId);
      if (!email) continue;
      const isDuplicate = existingDocs.some(
        (ed) =>
          ed.emailMessageId === doc.messageId ||
          areDuplicateDocuments(
            {
              documentTitle: doc.documentTitle,
              documentType: doc.documentType,
              receivedAt: email.receivedAt,
            },
            ed,
          ),
      );
      if (!isDuplicate) {
        docsToCreate.push({
          ownerId: user.id,
          emailMessageId: doc.messageId,
          sourceProvider: "GMAIL" as const,
          fromAddress: cleanAddress(email.from) || "unknown",
          subject: email.subject.slice(0, 500) || null,
          receivedAt: email.receivedAt,
          documentTitle: doc.documentTitle,
          documentType: doc.documentType,
          filename: doc.filename || null,
          mimeType: doc.mimeType || "application/pdf",
          fileSizeBytes: doc.fileSizeBytes || null,
          attachmentId: doc.attachmentId || null,
          expiryDate: doc.expiryDate,
          aiConfidence: doc.confidence,
          aiReason: doc.reason,
          status: "PENDING" as const,
        });
        existingDocs.push({
          id: doc.messageId,
          emailMessageId: doc.messageId,
          documentTitle: doc.documentTitle,
          documentType: doc.documentType,
          receivedAt: email.receivedAt,
          aiConfidence: doc.confidence,
        });
      }
    }
    if (docsToCreate.length > 0) {
      await prisma.emailDocumentImport.createMany({
        data: docsToCreate,
        skipDuplicates: true,
      });
    }
    const documentsAdded = docsToCreate.length;

    const remsToCreate = [];
    for (const rem of multiResult.reminders) {
      const email = emailById.get(rem.messageId);
      if (!email) continue;
      const isDuplicate = existingRems.some(
        (er) =>
          er.emailMessageId === rem.messageId ||
          areDuplicateReminders({ title: rem.title, dueAt: rem.dueAt, amount: rem.amount }, er),
      );
      if (!isDuplicate) {
        remsToCreate.push({
          ownerId: user.id,
          emailMessageId: rem.messageId,
          sourceProvider: "GMAIL" as const,
          fromAddress: cleanAddress(email.from) || "unknown",
          subject: email.subject.slice(0, 500) || null,
          receivedAt: email.receivedAt,
          title: rem.title,
          description: rem.description,
          category: rem.category as ReminderCategory,
          dueAt: rem.dueAt,
          amount: rem.amount,
          currency: rem.currency || "INR",
          aiConfidence: rem.confidence,
          aiReason: rem.reason,
          status: "PENDING" as const,
        });
        existingRems.push({
          id: rem.messageId,
          emailMessageId: rem.messageId,
          title: rem.title,
          dueAt: rem.dueAt,
          amount:
            rem.amount !== null && rem.amount !== undefined ? new Prisma.Decimal(rem.amount) : null,
          aiConfidence: rem.confidence,
        });
      }
    }
    if (remsToCreate.length > 0) {
      await prisma.emailReminderImport.createMany({
        data: remsToCreate,
        skipDuplicates: true,
      });
    }
    const remindersAdded = remsToCreate.length;

    const pendingCount = await prisma.emailTransactionImport.count({
      where: { ownerId: user.id, status: "PENDING" },
    });
    const ignored =
      Math.max(0, fetchedEmails.length - emails.length) +
      Math.max(0, emailsToClassify.length - classified.length);

    await createAuditLog({
      userId: user.id,
      action: "GMAIL_SYNC",
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
      metadata: {
        messagesExamined: messageIds.length,
        aiClassified: emailsToClassify.length,
        relevanceFiltered: Math.max(0, fetchedEmails.length - emails.length),
        transactionsDetected: classified.length,
        added: insertedCount + legacyUpdated,
        duplicatesFiltered: candidates.length - uniqueCandidates.length,
        legacyUpdated,
        ignored,
        legacyRemoved,
        lookbackDays,
        gmailPageSize: 30,
        geminiBatchSize: 15,
        statementAttachments: statementAttachmentStats,
      },
    });

    return NextResponse.json({
      success: true,
      messagesExamined: messageIds.length,
      relevanceSelected: emails.length,
      detected: classified.length,
      added: insertedCount + legacyUpdated,
      duplicates: Math.max(0, classified.length - insertedCount - legacyUpdated),
      ignored,
      legacyRemoved,
      pendingCount,
      documentsCount: documentsAdded,
      remindersCount: remindersAdded,
      statementAttachments: statementAttachmentStats,
      connection: updatedConnection,
      hasMore: Boolean(nextPageToken),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Gmail sync error";
    console.error("POST /api/integrations/gmail/sync error:", error);
    if (/invalid_grant|invalid credentials|unauthorized|401/i.test(message)) {
      const user = await getCurrentUser().catch(() => null);
      if (user) {
        await prisma.gmailConnection.updateMany({
          where: { ownerId: user.id },
          data: { status: "RECONNECT_REQUIRED" },
        });
      }
      return NextResponse.json(
        { error: "Gmail needs to be reconnected. Please connect it again." },
        { status: 409 },
      );
    }
    if (/GEMINI_API_KEY|Gemini/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Could not sync Gmail transaction emails." },
      { status: 500 },
    );
  }
}

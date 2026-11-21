import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { consumeSecurityAttempt } from "@/lib/security-rate-limit";
import { removeDuplicateTransactions } from "@/lib/gmail/dedupe-transactions";
import { areDuplicateDocuments, areDuplicateReminders } from "@/lib/sync/dedupe-email-items";
import {
  extractAccountLastFour,
  extractAccountNumberHint,
  matchFinancialAccount,
} from "@/lib/gmail/account-matching";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import {
  encryptOutlookRefreshToken,
  getOutlookMessages,
  getOutlookPdfAttachments,
  normalizeOutlookBody,
  refreshOutlookAccessToken,
  type OutlookMessage,
} from "@/lib/outlook/oauth";
import { processFinancialPdfAttachments } from "@/lib/email-statement-attachments";
import { z } from "zod";

const outlookSyncSchema = z.object({
  lookbackDays: z.coerce
    .number()
    .int("Choose a sync window between 2 and 180 days.")
    .min(2, "Choose a sync window between 2 and 180 days.")
    .max(180, "Choose a sync window between 2 and 180 days.")
    .default(7),
  continuePage: z.boolean().optional().default(false),
});
import { type GmailEmailForClassification } from "@/lib/gmail/classify-transaction-emails";
import {
  classifyMultiModuleBatch,
  rankMultiModuleEmails,
  type MultiModuleClassificationResult,
} from "@/lib/sync/classify-multi-module-emails";
import { type ReminderCategory, Prisma } from "@prisma/client";

async function classifyMultiInBatches(emails: GmailEmailForClassification[]) {
  const result: MultiModuleClassificationResult = {
    transactions: [],
    documents: [],
    reminders: [],
  };
  for (let offset = 0; offset < emails.length; offset += 15) {
    const batch = await classifyMultiModuleBatch(emails.slice(offset, offset + 15), {
      logPrefix: "[OUTLOOK-SYNC]",
    });
    result.transactions.push(...batch.transactions);
    result.documents.push(...batch.documents);
    result.reminders.push(...batch.reminders);
  }
  return result;
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

function toClassificationEmail(message: OutlookMessage): GmailEmailForClassification {
  const address = message.from?.emailAddress?.address || "unknown";
  const receivedAt = new Date(message.receivedDateTime || Date.now());
  const messageId = `outlook:${message.id}`;
  return {
    messageId,
    threadId: message.conversationId || null,
    from: address,
    subject: (message.subject || "").slice(0, 500),
    body: normalizeOutlookBody(message),
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });

    const rate = await consumeSecurityAttempt({
      key: `outlook-sync:${user.id}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many Outlook sync requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds || 900) } },
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parseResult = outlookSyncSchema.safeParse(rawBody);
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

    const connection = await prisma.outlookConnection.findUnique({ where: { ownerId: user.id } });
    if (!connection || connection.status !== "CONNECTED") {
      return NextResponse.json(
        { error: "Connect Outlook before syncing transactions." },
        { status: 409 },
      );
    }

    const tokens = await refreshOutlookAccessToken(connection.refreshTokenEncrypted);
    // Validate token refresh result before persisting to database
    if (
      !tokens.accessToken ||
      typeof tokens.accessToken !== "string" ||
      !tokens.accessToken.trim()
    ) {
      return NextResponse.json(
        { error: "Failed to refresh Outlook access token. Please reconnect Outlook." },
        { status: 502 },
      );
    }
    if (
      !tokens.refreshToken ||
      typeof tokens.refreshToken !== "string" ||
      !tokens.refreshToken.trim()
    ) {
      return NextResponse.json(
        { error: "Failed to refresh Outlook refresh token. Please reconnect Outlook." },
        { status: 502 },
      );
    }
    // Persist Microsoft refresh-token rotation immediately, even if Graph or Gemini later fails.
    await prisma.outlookConnection.update({
      where: { ownerId: user.id },
      data: {
        refreshTokenEncrypted: encryptOutlookRefreshToken(tokens.refreshToken),
        status: "CONNECTED",
      },
    });
    const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const dateFilter = `receivedDateTime ge ${sinceDate.toISOString()} and isDraft eq false`;

    const fetchedOutlookMessages: OutlookMessage[] = [];
    let currentNextLink: string | null = continuePage === true ? connection.syncPageToken : null;
    let lastNextLink: string | null = null;
    const MAX_OUTLOOK_EMAILS = 100;

    do {
      const page = await getOutlookMessages(tokens.accessToken, currentNextLink, {
        filter: currentNextLink ? undefined : dateFilter,
      });
      fetchedOutlookMessages.push(...page.messages);
      lastNextLink = page.nextLink;
      currentNextLink = page.nextLink;
      if (continuePage) break;
    } while (currentNextLink && fetchedOutlookMessages.length < MAX_OUTLOOK_EMAILS);

    // Filter out drafts and messages sent by the user so we only scan incoming mail across all folders
    const incomingOutlookMessages = fetchedOutlookMessages.filter((msg) => {
      if (msg.isDraft) return false;
      const fromAddr = msg.from?.emailAddress?.address?.trim().toLowerCase();
      const connAddr = connection.emailAddress?.trim().toLowerCase();
      if (fromAddr && connAddr && fromAddr === connAddr) return false;
      return true;
    });

    const fetchedEmails = incomingOutlookMessages.map(toClassificationEmail);
    const emails = rankMultiModuleEmails(fetchedEmails, MAX_OUTLOOK_EMAILS);

    const providerIds = emails.map((email) => email.messageId);
    const existing = providerIds.length
      ? await prisma.emailTransactionImport.findMany({
          where: {
            ownerId: user.id,
            emailMessageId: { in: providerIds },
            sourceProvider: "OUTLOOK",
          },
          select: { id: true, emailMessageId: true, status: true, aiClassifiedAt: true },
        })
      : [];
    const existingById = new Map(existing.map((item) => [item.emailMessageId, item]));
    const legacyById = new Map(
      existing
        .filter((item) => item.status === "PENDING" && item.aiClassifiedAt === null)
        .map((item) => [item.emailMessageId, item]),
    );
    const toClassify = emails.filter((email) => {
      const prior = existingById.get(email.messageId);
      return !prior || legacyById.has(email.messageId);
    });
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
          `Outlook sync: Reached PDF processing limit (${maxPdfsPerSync}), skipping remaining PDFs.`,
        );
        break;
      }
      const rawId = email.messageId.replace(/^outlook:/, "");
      const message = fetchedOutlookMessages.find((item) => item.id === rawId);
      if (!message) {
        console.warn(`[Outlook Sync] Message ${rawId} was not found in fetched page messages.`);
        continue;
      }
      if (!message.hasAttachments) continue;
      const attachments = await getOutlookPdfAttachments(tokens.accessToken, rawId);
      if (attachments.length > 0) {
        pdfsProcessed += 1;
        const result = await processFinancialPdfAttachments(
          {
            ownerId: user.id,
            provider: "OUTLOOK",
            messageId: rawId,
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
      multiResult = await classifyMultiInBatches(toClassify);
    } catch (classifyError) {
      console.error("Outlook sync classification error:", classifyError);
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
    const emailById = new Map(toClassify.map((email) => [email.messageId, email]));

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
          sourceProvider: "OUTLOOK",
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
    const { insertedCount, legacyRemoved, legacyUpdated } = await prisma.$transaction(
      async (tx) => {
        let removed = 0;
        let updated = 0;
        for (const [messageId, legacy] of legacyById) {
          const item = classifiedById.get(messageId);
          if (!item) {
            const res = await tx.emailTransactionImport.deleteMany({
              where: { id: legacy.id, ownerId: user.id, status: "PENDING", aiClassifiedAt: null },
            });
            removed += res.count;
          } else {
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
            updated += 1;
          }
        }

        const inserted = uniqueCandidates.length
          ? await tx.emailTransactionImport.createMany({
              data: uniqueCandidates,
              skipDuplicates: true,
            })
          : { count: 0 };

        await tx.outlookConnection.update({
          where: { ownerId: user.id },
          data: {
            lastSyncedAt: new Date(),
            status: "CONNECTED",
            syncPageToken: lastNextLink,
          },
        });

        return {
          insertedCount: inserted.count,
          legacyRemoved: removed,
          legacyUpdated: updated,
        };
      },
    );

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
          sourceProvider: "OUTLOOK" as const,
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
          sourceProvider: "OUTLOOK" as const,
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

    await prisma.outlookConnection.update({
      where: { ownerId: user.id },
      data: {
        lastSyncedAt: new Date(),
        syncPageToken: lastNextLink || null,
      },
    });

    const pendingCount = await prisma.emailTransactionImport.count({
      where: { ownerId: user.id, status: "PENDING" },
    });
    const ignored =
      Math.max(0, fetchedEmails.length - emails.length) +
      Math.max(0, toClassify.length - classified.length);

    await createAuditLog({
      userId: user.id,
      action: "OUTLOOK_SYNC",
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
      metadata: {
        messagesExamined: fetchedOutlookMessages.length,
        aiClassified: toClassify.length,
        relevanceFiltered: Math.max(0, fetchedEmails.length - emails.length),
        transactionsDetected: classified.length,
        added: insertedCount + legacyUpdated,
        duplicatesFiltered: candidates.length - uniqueCandidates.length,
        ignored,
        legacyRemoved,
        graphPageSize: 30,
        geminiBatchSize: 15,
        statementAttachments: statementAttachmentStats,
      },
    });

    return NextResponse.json({
      success: true,
      messagesExamined: fetchedOutlookMessages.length,
      relevanceSelected: emails.length,
      added: insertedCount + legacyUpdated,
      duplicatesFiltered: candidates.length - uniqueCandidates.length,
      ignored,
      legacyRemoved,
      duplicates: Math.max(0, classified.length - insertedCount - legacyUpdated),
      pendingCount,
      documentsCount: documentsAdded,
      remindersCount: remindersAdded,
      statementAttachments: statementAttachmentStats,
      hasMore: Boolean(lastNextLink),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Outlook sync error";
    console.error("POST /api/integrations/outlook/sync error:", error);
    if (/invalid_grant|invalid credentials|unauthorized|401/i.test(message)) {
      const user = await getCurrentUser().catch(() => null);
      if (user) {
        await prisma.outlookConnection.updateMany({
          where: { ownerId: user.id },
          data: { status: "RECONNECT_REQUIRED" },
        });
      }
      return NextResponse.json(
        { error: "Outlook needs to be reconnected. Please connect it again." },
        { status: 409 },
      );
    }
    if (/GEMINI_API_KEY|Gemini/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Could not sync Outlook transaction emails." },
      { status: 500 },
    );
  }
}

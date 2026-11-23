import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAuthorizedGmail, decryptGmailRefreshToken } from "@/lib/gmail/oauth";
import { validateCSRFRequest } from "@/lib/csrf";
import { extractGmailMessageText } from "@/lib/gmail/parse-transaction-email";
import type { GmailEmailForClassification } from "@/lib/gmail/classify-transaction-emails";
import {
  classifyMultiInBatches,
  rankMultiModuleEmails,
  type MultiModuleClassificationResult,
} from "@/lib/sync/classify-multi-module-emails";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { consumeSecurityAttempt } from "@/lib/security-rate-limit";
import { loadGmailPdfAttachments } from "@/lib/sync/email-sync-provider";
import {
  buildTransactionCandidates,
  dedupeTransactionCandidates,
  extractStatementPdfsFromEmails,
  insertReviewCandidates,
  legacyPendingByMessageId,
  loadSyncFinancialAccounts,
  loadTransactionFingerprints,
  persistDiscoveredEmailImports,
  reconcileLegacyPendingImports,
} from "@/lib/sync/email-import-persistence";
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
    const legacyPending = legacyPendingByMessageId(existing);
    const messageIdsToClassify = messageIds.filter((id) => {
      const prior = existingById.get(id);
      return !prior || legacyPending.has(id);
    });
    const fetchedEmails = await loadEmailBatch(gmail, messageIds);
    const emails = rankMultiModuleEmails(fetchedEmails, MAX_GMAIL_EMAILS_PER_SYNC);
    const classifyIds = new Set(messageIdsToClassify);
    const emailsToClassify = emails.filter((email) => classifyIds.has(email.messageId));

    // Statement PDFs are downloaded only for the locally selected financial emails.
    // PDF contents and password candidates remain server-side and are never sent to Gemini.
    const { stats: statementAttachmentStats } = await extractStatementPdfsFromEmails({
      ownerId: user.id,
      provider: "GMAIL",
      emails,
      fetchAttachments: (email) => loadGmailPdfAttachments(gmail, email.messageId),
      messageIdFor: (id) => id,
      maxPdfs: 10,
      logPrefix: "[GMAIL-SYNC]",
    });

    let multiResult: MultiModuleClassificationResult = {
      transactions: [],
      documents: [],
      reminders: [],
    };
    try {
      multiResult = await classifyMultiInBatches(emailsToClassify, "[GMAIL-SYNC]");
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

    const [financialAccounts, fingerprints] = await Promise.all([
      loadSyncFinancialAccounts(user.id),
      loadTransactionFingerprints(user.id),
    ]);
    const candidates = buildTransactionCandidates({
      ownerId: user.id,
      provider: "GMAIL",
      classified,
      emailById,
      financialAccounts,
      trackedMessageIds: new Set(existingById.keys()),
    });
    const uniqueCandidates = dedupeTransactionCandidates(candidates, fingerprints);

    // Wrap all database updates in a single transaction to ensure atomicity
    const { insertedCount, legacyRemoved, legacyUpdated, updatedConnection } =
      await prisma.$transaction(async (tx) => {
        const { removed, updated } = await reconcileLegacyPendingImports(tx, {
          ownerId: user.id,
          legacyByMessageId: legacyPending,
          classifiedById,
        });

        const inserted = await insertReviewCandidates(tx, {
          ownerId: user.id,
          provider: "GMAIL",
          candidates: uniqueCandidates,
        });

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
          insertedCount: inserted,
          legacyRemoved: removed,
          legacyUpdated: updated,
          updatedConnection: conn,
        };
      });

    const { documentsAdded, remindersAdded } = await persistDiscoveredEmailImports({
      ownerId: user.id,
      provider: "GMAIL",
      documents: multiResult.documents,
      reminders: multiResult.reminders,
      emailById,
    });

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
        geminiBatchSize: 5,
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

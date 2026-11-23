import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { consumeSecurityAttempt } from "@/lib/security-rate-limit";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import {
  encryptOutlookRefreshToken,
  getOutlookMessages,
  getOutlookPdfAttachments,
  refreshOutlookAccessToken,
  type OutlookMessage,
} from "@/lib/outlook/oauth";
import { toOutlookClassificationEmail } from "@/lib/sync/email-sync-provider";
import {
  classifyMultiInBatches,
  rankMultiModuleEmails,
  type MultiModuleClassificationResult,
} from "@/lib/sync/classify-multi-module-emails";
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

const outlookSyncSchema = z.object({
  lookbackDays: z.coerce
    .number()
    .int("Choose a sync window between 2 and 180 days.")
    .min(2, "Choose a sync window between 2 and 180 days.")
    .max(180, "Choose a sync window between 2 and 180 days.")
    .default(7),
  continuePage: z.boolean().optional().default(false),
});

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

    const fetchedEmails = incomingOutlookMessages.map(toOutlookClassificationEmail);
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
    const legacyById = legacyPendingByMessageId(existing);
    const toClassify = emails.filter((email) => {
      const prior = existingById.get(email.messageId);
      return !prior || legacyById.has(email.messageId);
    });

    const { stats: statementAttachmentStats } = await extractStatementPdfsFromEmails({
      ownerId: user.id,
      provider: "OUTLOOK",
      emails,
      fetchAttachments: async (email) => {
        const rawId = email.messageId.replace(/^outlook:/, "");
        const message = fetchedOutlookMessages.find((item) => item.id === rawId);
        if (!message?.hasAttachments) return [];
        return getOutlookPdfAttachments(tokens.accessToken, rawId);
      },
      messageIdFor: (id) => id.replace(/^outlook:/, ""),
      maxPdfs: 10,
      logPrefix: "[OUTLOOK-SYNC]",
    });

    let multiResult: MultiModuleClassificationResult = {
      transactions: [],
      documents: [],
      reminders: [],
    };
    try {
      multiResult = await classifyMultiInBatches(toClassify, "[OUTLOOK-SYNC]");
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

    const [financialAccounts, fingerprints] = await Promise.all([
      loadSyncFinancialAccounts(user.id),
      loadTransactionFingerprints(user.id),
    ]);
    const candidates = buildTransactionCandidates({
      ownerId: user.id,
      provider: "OUTLOOK",
      classified,
      emailById,
      financialAccounts,
      trackedMessageIds: new Set(existingById.keys()),
    });
    const uniqueCandidates = dedupeTransactionCandidates(candidates, fingerprints);

    // Wrap all database updates in a single transaction to ensure atomicity
    const { insertedCount, legacyRemoved, legacyUpdated } = await prisma.$transaction(
      async (tx) => {
        const { removed, updated } = await reconcileLegacyPendingImports(tx, {
          ownerId: user.id,
          legacyByMessageId: legacyById,
          classifiedById,
        });

        const inserted = await insertReviewCandidates(tx, {
          ownerId: user.id,
          provider: "OUTLOOK",
          candidates: uniqueCandidates,
        });

        await tx.outlookConnection.update({
          where: { ownerId: user.id },
          data: {
            lastSyncedAt: new Date(),
            status: "CONNECTED",
            syncPageToken: lastNextLink,
          },
        });

        return {
          insertedCount: inserted,
          legacyRemoved: removed,
          legacyUpdated: updated,
        };
      },
    );

    const { documentsAdded, remindersAdded } = await persistDiscoveredEmailImports({
      ownerId: user.id,
      provider: "OUTLOOK",
      documents: multiResult.documents,
      reminders: multiResult.reminders,
      emailById,
    });

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
        geminiBatchSize: 5,
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

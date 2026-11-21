import { prisma } from "@/lib/prisma";
import type { WealthAccountType, ReminderCategory } from "@prisma/client";
import { createAuthorizedGmail, decryptGmailRefreshToken } from "@/lib/gmail/oauth";
import { extractGmailMessageText } from "@/lib/gmail/parse-transaction-email";
import {
  type GmailEmailForClassification,
  type ClassifiedGmailTransaction,
} from "@/lib/gmail/classify-transaction-emails";
import {
  classifyMultiModuleBatch,
  rankMultiModuleEmails,
  type MultiModuleClassificationResult,
} from "@/lib/sync/classify-multi-module-emails";
import {
  extractAccountLastFour,
  extractAccountNumberHint,
  matchFinancialAccount,
} from "@/lib/gmail/account-matching";
import {
  removeDuplicateTransactions,
  type TransactionFingerprint,
} from "@/lib/gmail/dedupe-transactions";
import { areDuplicateDocuments, areDuplicateReminders } from "@/lib/sync/dedupe-email-items";
import { processFinancialPdfAttachments } from "@/lib/email-statement-attachments";
import {
  getOutlookMessages,
  getOutlookPdfAttachments,
  normalizeOutlookBody,
  refreshOutlookAccessToken,
  type OutlookMessage,
} from "@/lib/outlook/oauth";
import { createAuditLog } from "@/lib/audit-log";
import { createNotification, type NotificationType } from "@/lib/notifications";
import { getBalanceDelta } from "@/lib/wealth";

export interface EmailSyncOptions {
  lookbackDays?: number;
  maxPages?: number;
  autoImportThreshold?: number;
  maxPdfsPerSync?: number;
  fullSync?: boolean;
}

export interface UserEmailSyncResult {
  userId: string;
  provider: "GMAIL" | "OUTLOOK";
  pagesProcessed: number;
  emailsScanned: number;
  emailsClassified: number;
  transactionsAutoImported: number;
  transactionsPendingReview: number;
  documentsDiscovered: number;
  remindersAutoImported: number;
  remindersPendingReview: number;
  pdfsProcessed: number;
  hasMorePages: boolean;
  errors: string[];
}

export interface GlobalEmailSyncResult {
  startedAt: Date;
  completedAt: Date;
  usersProcessed: number;
  results: UserEmailSyncResult[];
  errors: string[];
}

export function cleanAddress(value: string): string {
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

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  name: string,
): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

async function loadGmailBatch(
  gmail: ReturnType<typeof createAuthorizedGmail>["gmail"],
  messageIds: string[],
): Promise<GmailEmailForClassification[]> {
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

export async function loadGmailPdfAttachments(
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
          if (data.length <= 20 * 1024 * 1024) {
            attachments.push({
              id: attachmentId,
              filename: filename || "statement.pdf",
              mimeType: "application/pdf",
              data,
            });
          }
        }
      } else if (part.body?.data) {
        const data = Buffer.from(part.body.data, "base64url");
        if (data.length <= 20 * 1024 * 1024) {
          attachments.push({
            id: `${messageId}-inline-${attachments.length}`,
            filename: filename || "statement.pdf",
            mimeType: "application/pdf",
            data,
          });
        }
      }
    }
    for (const child of part.parts || []) await visit(child);
  };
  if (response.data.payload) await visit(response.data.payload);
  return attachments;
}

export function toOutlookClassificationEmail(message: OutlookMessage): GmailEmailForClassification {
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

export function inferDiscoveredAccountType(
  bankName: string,
  description: string,
): WealthAccountType {
  const text = `${bankName} ${description}`.toLowerCase();
  if (/(credit\s?card|visa|mastercard|amex|rupay)/i.test(text)) return "CREDIT_CARD";
  if (/(stock|equity|demat|broker|zerodha|groww|upstox|angel)/i.test(text))
    return "STOCK_PORTFOLIO";
  if (/(mutual\s?fund|sip|mf)/i.test(text)) return "MUTUAL_FUND";
  if (/(fixed\s?deposit|\bfd\b)/i.test(text)) return "FIXED_DEPOSIT";
  if (/(loan|emi|mortgage)/i.test(text)) return "LOAN";
  if (/(wallet|pluxee|sodexo|paytm|phonepe|amazon\s?pay|prepaid|meal|gift\s?card)/i.test(text))
    return "OTHER";
  if (/(current\s?account)/i.test(text)) return "CURRENT_ACCOUNT";
  return "SAVINGS_ACCOUNT";
}

export function formatDiscoveredAccountName(
  bankName?: string | null,
  merchant?: string | null,
  lastFour?: string | null,
): string {
  const institution = (bankName || merchant || "Discovered").trim();
  if (lastFour && lastFour.length === 4) {
    return `${institution} (***${lastFour})`;
  }
  return `${institution} (Auto-Discovered)`;
}

async function classifyMultiInBatches(
  emails: GmailEmailForClassification[],
  logPrefix: string = "[AI]",
): Promise<MultiModuleClassificationResult> {
  const allTransactions: ClassifiedGmailTransaction[] = [];
  const allDocuments: MultiModuleClassificationResult["documents"] = [];
  const allReminders: MultiModuleClassificationResult["reminders"] = [];

  for (let offset = 0; offset < emails.length; offset += 5) {
    const chunk = emails.slice(offset, offset + 5);
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        const batch = await classifyMultiModuleBatch(chunk, { logPrefix });
        allTransactions.push(...batch.transactions);
        allDocuments.push(...batch.documents);
        allReminders.push(...batch.reminders);
        break;
      } catch (err) {
        attempts++;
        const msg = err instanceof Error ? err.message : String(err);
        const isRetryable =
          msg.includes("503") ||
          msg.includes("429") ||
          msg.includes("high demand") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("UNAVAILABLE");
        if (isRetryable && attempts < maxAttempts) {
          console.warn(
            `${logPrefix} Gemini transient error. Retrying in ${attempts * 2}s (attempt ${attempts + 1}/${maxAttempts})...`,
          );
          await new Promise((r) => setTimeout(r, attempts * 2000));
        } else {
          throw err;
        }
      }
    }
  }
  return {
    transactions: allTransactions,
    documents: allDocuments,
    reminders: allReminders,
  };
}

async function persistDiscoveredDocumentsAndReminders(
  userId: string,
  provider: "GMAIL" | "OUTLOOK",
  documents: MultiModuleClassificationResult["documents"],
  reminders: MultiModuleClassificationResult["reminders"],
  emailById: Map<string, GmailEmailForClassification>,
  autoImportThreshold: number,
  result: UserEmailSyncResult,
) {
  // Pre-load existing pending/imported records to prevent duplicate candidate creation
  const existingDocs = await prisma.emailDocumentImport.findMany({
    where: { ownerId: userId, status: { in: ["PENDING", "IMPORTED"] } },
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
    where: { ownerId: userId, status: { in: ["PENDING", "IMPORTED"] } },
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

  for (const doc of documents) {
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
      const created = await prisma.emailDocumentImport.create({
        data: {
          ownerId: userId,
          emailMessageId: doc.messageId,
          sourceProvider: provider,
          fromAddress: cleanAddress(email.from) || "unknown",
          subject: email.subject.slice(0, 500) || null,
          receivedAt: email.receivedAt,
          documentTitle: doc.documentTitle,
          documentType: doc.documentType,
          expiryDate: doc.expiryDate,
          aiConfidence: doc.confidence,
          aiReason: doc.reason,
          status: "PENDING",
        },
      });
      existingDocs.push({
        id: created.id,
        emailMessageId: created.emailMessageId,
        documentTitle: created.documentTitle,
        documentType: created.documentType,
        receivedAt: created.receivedAt,
        aiConfidence: created.aiConfidence,
      });
      result.documentsDiscovered++;
      console.log(
        `[${provider}]   📄 DISCOVERED Document: "${doc.documentTitle}" (${doc.documentType}) from ${email.from.slice(0, 30)}`,
      );
    }
  }

  for (const rem of reminders) {
    const email = emailById.get(rem.messageId);
    if (!email) continue;
    const isDuplicate = existingRems.some(
      (er) =>
        er.emailMessageId === rem.messageId ||
        areDuplicateReminders({ title: rem.title, dueAt: rem.dueAt, amount: rem.amount }, er),
    );
    if (!isDuplicate) {
      if (rem.confidence >= autoImportThreshold && rem.dueAt.getTime() > Date.now()) {
        const dupReminder = await prisma.reminder.findFirst({
          where: {
            userId,
            title: rem.title,
            dueAt: rem.dueAt,
          },
          select: { id: true },
        });
        if (!dupReminder) {
          const createdReminder = await prisma.reminder.create({
            data: {
              userId,
              title: rem.title,
              description: rem.description,
              category: rem.category as ReminderCategory,
              dueAt: rem.dueAt,
              recurrence: "NONE",
              notifyDaysBefore: [7, 1, 0],
              notifyInApp: true,
              notifyByEmail: true,
              isCompleted: false,
              isActive: true,
            },
          });

          const created = await prisma.emailReminderImport.create({
            data: {
              ownerId: userId,
              emailMessageId: rem.messageId,
              sourceProvider: provider,
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
              status: "IMPORTED",
              importedReminderId: createdReminder.id,
              importedAt: new Date(),
            },
          });
          existingRems.push({
            id: created.id,
            emailMessageId: created.emailMessageId,
            title: created.title,
            dueAt: created.dueAt,
            amount: created.amount,
            aiConfidence: created.aiConfidence,
          });
          result.remindersAutoImported++;
          console.log(
            `[${provider}]   ⏰ AUTO-IMPORTED Reminder: "${rem.title}" due ${rem.dueAt.toISOString().slice(0, 10)}`,
          );
          continue;
        } else {
          // A matching reminder already exists in the system; skip queuing redundant duplicate in review queue
          console.log(
            `[${provider}]   ℹ️ Skipped reminder duplicate: "${rem.title}" already exists in user reminders.`,
          );
          continue;
        }
      }

      const created = await prisma.emailReminderImport.create({
        data: {
          ownerId: userId,
          emailMessageId: rem.messageId,
          sourceProvider: provider,
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
          status: "PENDING",
        },
      });
      existingRems.push({
        id: created.id,
        emailMessageId: created.emailMessageId,
        title: created.title,
        dueAt: created.dueAt,
        amount: created.amount,
        aiConfidence: created.aiConfidence,
      });
      result.remindersPendingReview++;
      console.log(
        `[${provider}]   ⏰ QUEUED Reminder: "${rem.title}" due ${rem.dueAt.toISOString().slice(0, 10)}`,
      );
    }
  }
}

/**
 * Synchronize Gmail transaction alerts and statements for a user.
 * Paginates through emails, classifies candidates using Gemini, and safely
 * separates auto-import transactions (>=90% confidence + matched account)
 * from pending review candidates.
 */
export async function syncGmailUser(
  userId: string,
  options: EmailSyncOptions = {},
): Promise<UserEmailSyncResult> {
  const {
    lookbackDays,
    maxPages = 5,
    autoImportThreshold = 0.9,
    maxPdfsPerSync = 10,
    fullSync = false,
  } = options;

  const result: UserEmailSyncResult = {
    userId,
    provider: "GMAIL",
    pagesProcessed: 0,
    emailsScanned: 0,
    emailsClassified: 0,
    transactionsAutoImported: 0,
    transactionsPendingReview: 0,
    documentsDiscovered: 0,
    remindersAutoImported: 0,
    remindersPendingReview: 0,
    pdfsProcessed: 0,
    hasMorePages: false,
    errors: [],
  };

  const connection = await prisma.gmailConnection.findUnique({ where: { ownerId: userId } });
  if (!connection || connection.status !== "CONNECTED") {
    console.warn(`[GMAIL] User ${userId} has no active/connected Gmail integration.`);
    result.errors.push("Gmail not connected or inactive.");
    return result;
  }

  console.log(`[GMAIL] Starting Gmail sync for user ${userId} (${connection.emailAddress})...`);

  let refreshToken: string;
  try {
    refreshToken = decryptGmailRefreshToken(connection.refreshTokenEncrypted);
  } catch {
    await prisma.gmailConnection.update({
      where: { ownerId: userId },
      data: { status: "RECONNECT_REQUIRED" },
    });
    console.error(`[GMAIL] Token decryption failed for user ${userId}. Reconnect required.`);
    result.errors.push("Gmail token decryption failed. Reconnect required.");
    return result;
  }

  if (!refreshToken?.trim()) {
    console.error(`[GMAIL] Invalid or empty refresh token for user ${userId}.`);
    result.errors.push("Invalid refresh token.");
    return result;
  }

  const { gmail } = createAuthorizedGmail(refreshToken);

  const financialAccounts = await prisma.wealthAccount.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      type: true,
      bankName: true,
      provider: true,
      accountNumber: true,
      currency: true,
      currentBalance: true,
    },
  });

  console.log(
    `[GMAIL] Loaded ${financialAccounts.length} active Wealth account(s) for matching: ` +
      (financialAccounts.length > 0
        ? financialAccounts
            .map((a) => `${a.name} [***${a.accountNumber?.slice(-4) || "no-num"}]`)
            .join(", ")
        : "None (candidates will queue for manual review)"),
  );

  const [reviewDuplicates, savedTransactions] = await Promise.all([
    prisma.emailTransactionImport.findMany({
      where: { ownerId: userId, status: { in: ["PENDING", "IMPORTED"] } },
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
      where: { account: { ownerId: userId } },
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

  const runningFingerprints: TransactionFingerprint[] = [
    ...reviewDuplicates,
    ...savedTransactions.map((item) => ({
      ...item,
      bankName: item.account.bankName || item.account.name,
    })),
  ];

  console.log(
    `[GMAIL] Tracking ${runningFingerprints.length} existing transaction fingerprint(s) (${reviewDuplicates.length} email imports, ${savedTransactions.length} wealth transactions).`,
  );

  let currentPageToken: string | null = connection.syncPageToken;
  let totalPdfs = 0;

  // Determine whether this sync is full or incremental based on lastSyncedAt
  const isIncremental = !fullSync && Boolean(connection.lastSyncedAt);

  const multiModuleFilter =
    '(bank OR debited OR credited OR transaction OR statement OR card OR alert OR UPI OR NEFT OR IMPS OR payment OR spent OR withdrawn OR deposited OR transfer OR invoice OR receipt OR policy OR contract OR certificate OR tax OR warranty OR due OR renewal OR "due date" OR "expiry date" OR "bill generated")';

  let dateFilter = "";
  if (lookbackDays) {
    dateFilter = `newer_than:${lookbackDays}d`;
  } else if (isIncremental && connection.lastSyncedAt) {
    const lastDate = new Date(connection.lastSyncedAt);
    const bufferDate = new Date(lastDate.getTime() - 24 * 60 * 60 * 1000);
    const yyyy = bufferDate.getUTCFullYear();
    const mm = String(bufferDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(bufferDate.getUTCDate()).padStart(2, "0");
    dateFilter = `after:${yyyy}/${mm}/${dd}`;
  }

  const query = [dateFilter, "-in:sent", multiModuleFilter].filter(Boolean).join(" ");

  if (isIncremental && connection.lastSyncedAt) {
    console.log(
      `[GMAIL] Incremental sync active: processing emails received after ${connection.lastSyncedAt.toISOString().slice(0, 10)} (Last synced: ${connection.lastSyncedAt.toISOString()}).`,
    );
  } else {
    console.log(
      `[GMAIL] Full mailbox sync active: fetching entire inbox without date restriction.`,
    );
  }

  for (let page = 0; page < maxPages; page++) {
    result.pagesProcessed++;

    console.log(
      `[GMAIL] [Page ${page + 1}/${maxPages}] Querying Gmail: "${query}" (Cursor: ${currentPageToken ? "active pageToken" : "none"})...`,
    );

    let listResponse;
    try {
      listResponse = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 30,
        ...(currentPageToken ? { pageToken: currentPageToken } : {}),
      });
    } catch (apiError) {
      const msg = apiError instanceof Error ? apiError.message : "Gmail API error";
      console.error(`[GMAIL] [Page ${page + 1}] List error:`, msg);
      result.errors.push(`Gmail list error: ${msg}`);
      break;
    }

    const messages = listResponse.data.messages || [];
    console.log(
      `[GMAIL] [Page ${page + 1}] Retrieved ${messages.length} message reference(s) from Gmail.`,
    );

    if (messages.length === 0) {
      console.log(
        `[GMAIL] [Page ${page + 1}] No further messages found. Reached end of Gmail search.`,
      );
      if (result.errors.length === 0) {
        await prisma.gmailConnection.update({
          where: { ownerId: userId },
          data: { syncPageToken: null, lastSyncedAt: new Date() },
        });
      } else {
        console.warn(
          `[GMAIL] Reached end of messages, but skipping lastSyncedAt update due to ${result.errors.length} active error(s).`,
        );
      }
      result.hasMorePages = false;
      break;
    }

    const messageIds = messages.map((m) => m.id).filter((id): id is string => Boolean(id));
    result.emailsScanned += messageIds.length;

    const existing = await prisma.emailTransactionImport.findMany({
      where: { ownerId: userId, emailMessageId: { in: messageIds } },
      select: { id: true, emailMessageId: true, status: true, aiClassifiedAt: true },
    });
    const existingById = new Map(existing.map((item) => [item.emailMessageId, item]));
    const unclassifiedIds = messageIds.filter((id) => !existingById.has(id));

    console.log(
      `[GMAIL] [Page ${page + 1}] Status check: ${existingById.size} message(s) already processed in database, ${unclassifiedIds.length} new message(s) to fetch and inspect.`,
    );

    if (unclassifiedIds.length > 0) {
      let fetchedEmails: GmailEmailForClassification[] = [];
      try {
        console.log(
          `[GMAIL] [Page ${page + 1}] Fetching full content for ${unclassifiedIds.length} email(s)...`,
        );
        fetchedEmails = await loadGmailBatch(gmail, unclassifiedIds);
      } catch (loadErr) {
        const errorMsg = loadErr instanceof Error ? loadErr.message : "error";
        console.error(`[GMAIL] [Page ${page + 1}] Failed to load email batch:`, errorMsg);
        result.errors.push(`Failed to load email batch: ${errorMsg}`);
        break;
      }

      console.log(
        `[GMAIL] [Page ${page + 1}/${maxPages}] ── ${fetchedEmails.length} email(s) found on page ──`,
      );
      fetchedEmails.forEach((email, idx) => {
        const dateStr = email.receivedAt.toISOString().slice(0, 10);
        const fromInfo =
          process.env.NODE_ENV === "production" ? "[REDACTED]" : email.from.slice(0, 40);
        const subjectInfo =
          process.env.NODE_ENV === "production" ? "[REDACTED]" : `"${email.subject.slice(0, 60)}"`;
        console.log(
          `[GMAIL]   #${idx + 1}. [${email.messageId}] (${dateStr}) From: ${fromInfo} | Subject: ${subjectInfo}`,
        );
      });

      const rankedEmails = rankMultiModuleEmails(fetchedEmails, 30);
      console.log(
        `[GMAIL] [Page ${page + 1}/${maxPages}] Filtered ${rankedEmails.length}/${fetchedEmails.length} email(s) across transactions, documents, and reminders to send for AI processing.`,
      );

      // Statement attachments
      for (const email of rankedEmails) {
        if (
          !/(statement|e-statement|account summary|transaction summary|monthly report)/i.test(
            `${email.subject} ${email.body.slice(0, 1200)}`,
          )
        ) {
          continue;
        }
        if (totalPdfs >= maxPdfsPerSync) break;

        try {
          const attachments = await loadGmailPdfAttachments(gmail, email.messageId);
          if (attachments.length > 0) {
            totalPdfs++;
            result.pdfsProcessed++;
            console.log(
              `[GMAIL] [Page ${page + 1}] Found statement PDF attachment(s) in email "${email.subject.slice(0, 40)}": ${attachments.map((a) => a.filename).join(", ")}. Extracting...`,
            );
            const pdfRes = await processFinancialPdfAttachments(
              {
                ownerId: userId,
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
            console.log(
              `[GMAIL] [Page ${page + 1}] Statement PDF extracted: ${pdfRes.extracted} rows, ${pdfRes.added} added to review, ${pdfRes.duplicates} duplicates, ${pdfRes.failed} failed.`,
            );
          }
        } catch (pdfErr) {
          console.warn("[GMAIL] Error processing statement PDF:", pdfErr);
        }
      }

      // Gemini multi-module classification
      let classified: ClassifiedGmailTransaction[] = [];
      let multiResult: MultiModuleClassificationResult = {
        transactions: [],
        documents: [],
        reminders: [],
      };
      if (rankedEmails.length > 0) {
        try {
          console.log(
            `[GMAIL] [Page ${page + 1}/${maxPages}] Calling Gemini multi-module classification on ${rankedEmails.length} candidate email(s)...`,
          );
          multiResult = await classifyMultiInBatches(rankedEmails, "[GMAIL:AI]");
          classified = multiResult.transactions;
          result.emailsClassified += rankedEmails.length;
        } catch (classifyErr) {
          const errMsg = classifyErr instanceof Error ? classifyErr.message : "error";
          console.error(`[GMAIL] [Page ${page + 1}] Gemini classification error:`, errMsg);
          result.errors.push(`Gemini classification error: ${errMsg}`);
          break;
        }
      }

      const emailById = new Map(rankedEmails.map((e) => [e.messageId, e]));

      const rawCandidates = classified.flatMap((item) => {
        const email = emailById.get(item.messageId);
        if (!email) return [];
        const lastFour = extractAccountLastFour(`${email.subject}\n${email.body}`);
        const hint = extractAccountNumberHint(`${email.subject}\n${email.body}`);
        const matchedId = matchFinancialAccount(financialAccounts, item.bankName, lastFour, hint);

        const matchedAccount = matchedId ? financialAccounts.find((a) => a.id === matchedId) : null;
        console.log(
          `[GMAIL] [Page ${page + 1}] Match candidate [${item.messageId}]: ` +
            `${item.type} ${item.amount} ${item.currency} (${item.merchant || item.bankName || "Unknown"}) ` +
            `| Last4: ${lastFour || "none"} | Matched Account: ${matchedAccount ? `${matchedAccount.name} (${matchedAccount.bankName})` : "UNMATCHED"}`,
        );

        return [
          {
            ownerId: userId,
            emailMessageId: item.messageId,
            threadId: email.threadId || null,
            fromAddress: cleanAddress(email.from) || "unknown",
            subject: email.subject || null,
            accountId: matchedId,
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
            sourceProvider: "GMAIL",
            emailBody: email.body,
          },
        ];
      });

      const uniqueCandidates = removeDuplicateTransactions(rawCandidates, runningFingerprints);
      if (rawCandidates.length > uniqueCandidates.length) {
        console.log(
          `[GMAIL] [Page ${page + 1}] Skipped ${rawCandidates.length - uniqueCandidates.length} duplicate transaction(s).`,
        );
      }

      // Separate into Auto-Import vs Pending Review
      const autoImportCandidates: typeof uniqueCandidates = [];
      const pendingCandidates: typeof uniqueCandidates = [];
      let hasAccountCreationError = false;

      for (const candidate of uniqueCandidates) {
        let matchedAccount = candidate.accountId
          ? financialAccounts.find((a) => a.id === candidate.accountId)
          : null;

        // Dynamic Account Creation:
        // When an alert has high confidence (>= threshold) and genuine bank/card details,
        // but no matching account exists, dynamically provision a new WealthAccount.
        // NOTE: Strictly restricted to verified bank/card institutions - never merchants!
        const verifiedBankName = candidate.bankName?.trim();
        const isMerchantName =
          Boolean(verifiedBankName) &&
          /^(amazon|flipkart|swiggy|zomato|uber|ola|irctc|bigrock|dineout|bookmyshow|makemytrip|cleartrip|netflix|spotify|google|apple|myntra|ebay|shopclues)/i.test(
            verifiedBankName || "",
          );

        if (
          !matchedAccount &&
          (candidate.aiConfidence ?? 0) >= autoImportThreshold &&
          verifiedBankName &&
          !isMerchantName &&
          verifiedBankName !== "Unknown" &&
          verifiedBankName !== "None"
        ) {
          const rawLastFour = extractAccountLastFour(
            `${candidate.subject || ""}\n${candidate.description || ""}`,
          );
          const autoName = formatDiscoveredAccountName(verifiedBankName, null, rawLastFour);

          // Re-check in case an account with matching currency and name was provisioned earlier in this cycle
          const existingDynamic = financialAccounts.find(
            (a) =>
              a.currency === candidate.currency &&
              (a.name.toLowerCase() === autoName.toLowerCase() ||
                (rawLastFour && a.accountNumber?.endsWith(rawLastFour))),
          );

          if (existingDynamic) {
            matchedAccount = existingDynamic;
            candidate.accountId = existingDynamic.id;
          } else {
            const accountType = inferDiscoveredAccountType(
              verifiedBankName,
              candidate.description || "",
            );
            try {
              const created = await prisma.wealthAccount.create({
                data: {
                  ownerId: userId,
                  name: autoName,
                  type: accountType,
                  bankName: verifiedBankName,
                  accountNumber: rawLastFour ? `***${rawLastFour}` : null,
                  currency: candidate.currency,
                  currentBalance: 0,
                  status: "ACTIVE",
                },
                select: {
                  id: true,
                  name: true,
                  type: true,
                  bankName: true,
                  provider: true,
                  accountNumber: true,
                  currency: true,
                  currentBalance: true,
                },
              });

              financialAccounts.push(created);
              matchedAccount = created;
              candidate.accountId = created.id;

              console.log(
                `[GMAIL]   ✨ AUTO-PROVISIONED Wealth account "${created.name}" (${created.currency}) for unmatched alert.`,
              );
            } catch (createErr) {
              const errMsg = createErr instanceof Error ? createErr.message : "Database error";
              console.error(`[GMAIL] Failed to auto-provision account for ${autoName}:`, createErr);
              result.errors.push(`Account creation failed for "${autoName}": ${errMsg}`);
              hasAccountCreationError = true;
              break;
            }
          }
        }

        const isAutoImportEligible =
          Boolean(matchedAccount) &&
          matchedAccount?.currency === candidate.currency &&
          (candidate.aiConfidence ?? 0) >= autoImportThreshold;

        if (isAutoImportEligible) {
          autoImportCandidates.push(candidate);
          console.log(
            `[GMAIL]   ✓ AUTO-IMPORT candidate: ${candidate.description} | ${candidate.amount} ${candidate.currency} -> ${matchedAccount?.name} (Confidence: ${(candidate.aiConfidence ?? 0).toFixed(2)})`,
          );
        } else {
          pendingCandidates.push(candidate);
          console.log(
            `[GMAIL]   ⏳ QUEUE REVIEW candidate: ${candidate.description} | ${candidate.amount} ${candidate.currency} (Reason: ${!candidate.accountId ? "Unmatched account" : `Confidence ${(candidate.aiConfidence ?? 0).toFixed(2)} < threshold ${autoImportThreshold}`})`,
          );
        }
      }

      if (hasAccountCreationError) {
        console.error(
          `[GMAIL] [Page ${page + 1}] Halting Gmail sync job due to account creation failure. lastSyncedAt and cursor NOT updated.`,
        );
        break;
      }

      // Save to database atomically in chronological ascending order
      if (autoImportCandidates.length > 0 || pendingCandidates.length > 0) {
        try {
          const chronologicalCandidates = [...autoImportCandidates].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          for (const candidate of chronologicalCandidates) {
            const account = financialAccounts.find((a) => a.id === candidate.accountId)!;
            const delta = getBalanceDelta(account.type, candidate.type, Number(candidate.amount));
            const newBalance = (Number(account.currentBalance) + delta).toFixed(2);
            account.currentBalance = newBalance as unknown as typeof account.currentBalance;

            await prisma.$transaction([
              prisma.wealthTransaction.create({
                data: {
                  accountId: account.id,
                  type: candidate.type,
                  amount: candidate.amount,
                  currency: candidate.currency,
                  description: candidate.description,
                  referenceNumber: candidate.referenceNumber,
                  date: candidate.date,
                  balanceAfter: newBalance,
                  notes: `Auto-imported by email worker from Gmail alert (${candidate.fromAddress}).`,
                },
              }),
              prisma.wealthAccount.update({
                where: { id: account.id },
                data: { currentBalance: newBalance },
              }),
              prisma.emailTransactionImport.upsert({
                where: {
                  ownerId_emailMessageId: {
                    ownerId: userId,
                    emailMessageId: candidate.emailMessageId,
                  },
                },
                create: {
                  ownerId: userId,
                  emailMessageId: candidate.emailMessageId,
                  threadId: candidate.threadId,
                  fromAddress: candidate.fromAddress,
                  subject: candidate.subject,
                  bankName: candidate.bankName,
                  merchant: candidate.merchant,
                  description: candidate.description,
                  amount: candidate.amount,
                  currency: candidate.currency,
                  type: candidate.type,
                  referenceNumber: candidate.referenceNumber,
                  date: candidate.date,
                  accountId: candidate.accountId,
                  status: "IMPORTED",
                  importedAt: new Date(),
                  sourceProvider: "GMAIL",
                  aiConfidence: candidate.aiConfidence,
                  aiReason: candidate.aiReason,
                  aiClassifiedAt: new Date(),
                },
                update: {
                  status: "IMPORTED",
                  importedAt: new Date(),
                  accountId: candidate.accountId,
                  aiConfidence: candidate.aiConfidence,
                  aiReason: candidate.aiReason,
                  aiClassifiedAt: new Date(),
                },
              }),
            ]);
          }

          if (pendingCandidates.length > 0) {
            await prisma.emailTransactionImport.createMany({
              data: pendingCandidates.map((c) => ({
                ownerId: userId,
                emailMessageId: c.emailMessageId,
                threadId: c.threadId,
                fromAddress: c.fromAddress,
                subject: c.subject,
                bankName: c.bankName,
                merchant: c.merchant,
                description: c.description,
                amount: c.amount,
                currency: c.currency,
                type: c.type,
                referenceNumber: c.referenceNumber,
                date: c.date,
                accountId: c.accountId,
                status: "PENDING" as const,
                sourceProvider: "GMAIL",
                aiConfidence: c.aiConfidence,
                aiReason: c.aiReason,
                aiClassifiedAt: new Date(),
              })),
              skipDuplicates: true,
            });
          }

          console.log(
            `[GMAIL] [Page ${page + 1}] Database updated: committed ${autoImportCandidates.length} auto-import(s) and ${pendingCandidates.length} review row(s).`,
          );
        } catch (dbErr) {
          const errMsg = dbErr instanceof Error ? dbErr.message : "Database error";
          console.error(`[GMAIL] [Page ${page + 1}] Transaction persistence failed:`, errMsg);
          result.errors.push(`Transaction persistence failed: ${errMsg}`);
          break;
        }
      }

      result.transactionsAutoImported += autoImportCandidates.length;
      result.transactionsPendingReview += pendingCandidates.length;

      // Add to running fingerprints for subsequent pages
      for (const item of uniqueCandidates) {
        runningFingerprints.push({
          amount: item.amount,
          currency: item.currency,
          type: item.type,
          date: item.date,
          referenceNumber: item.referenceNumber,
          bankName: item.bankName,
          merchant: item.merchant,
          description: item.description,
        });
      }

      // Persist discovered documents and reminders
      await persistDiscoveredDocumentsAndReminders(
        userId,
        "GMAIL",
        multiResult.documents,
        multiResult.reminders,
        emailById,
        autoImportThreshold,
        result,
      );
    }

    if (result.errors.length > 0) {
      console.error(
        `[GMAIL] [Page ${page + 1}] Halting Gmail sync job due to error(s). lastSyncedAt and syncPageToken will NOT be updated so unprocessed messages will be retried on the next cycle.`,
      );
      break;
    }

    currentPageToken = listResponse.data.nextPageToken || null;

    if (!currentPageToken) {
      console.log(
        `[GMAIL] [Page ${page + 1}] Reached end of Gmail search results. Mailbox is fully caught up.`,
      );
      if (result.errors.length === 0) {
        await prisma.gmailConnection.update({
          where: { ownerId: userId },
          data: {
            syncPageToken: null,
            lastSyncedAt: new Date(),
          },
        });
      }
      result.hasMorePages = false;
      break;
    } else {
      console.log(`[GMAIL] [Page ${page + 1}] Saved next page cursor. More pages exist in inbox.`);
      if (result.errors.length === 0) {
        await prisma.gmailConnection.update({
          where: { ownerId: userId },
          data: {
            syncPageToken: currentPageToken,
            ...(isIncremental ? { lastSyncedAt: new Date() } : {}),
          },
        });
      }
      result.hasMorePages = true;
    }
  }

  console.log(
    `[GMAIL] Finished Gmail sync for ${connection.emailAddress}: ` +
      `${result.pagesProcessed} page(s) processed, ${result.emailsScanned} email(s) scanned, ` +
      `${result.transactionsAutoImported} auto-imported, ${result.transactionsPendingReview} queued for review, ` +
      `${result.pdfsProcessed} PDF(s), ${result.errors.length} error(s).`,
  );

  // Notifications and audit logs
  if (result.transactionsAutoImported > 0) {
    await createAuditLog({
      userId,
      action: "EMAIL_TRANSACTION_AUTO_IMPORT",
      metadata: {
        provider: "GMAIL",
        count: result.transactionsAutoImported,
      },
    });

    await createNotification({
      userId,
      type: "WEALTH_TRANSACTION_AUTO_IMPORTED" as NotificationType,
      title: "Transactions Auto-Imported",
      message: `${result.transactionsAutoImported} transaction${result.transactionsAutoImported > 1 ? "s were" : " was"} auto-imported from your Gmail alerts.`,
      actionUrl: "/wealth",
      idempotencyKey: `auto-import:gmail:${userId}:${Date.now()}`,
    });
  }

  if (result.transactionsPendingReview > 0) {
    await createNotification({
      userId,
      type: "WEALTH_TRANSACTION_PENDING_REVIEW" as NotificationType,
      title: "New Transactions for Review",
      message: `${result.transactionsPendingReview} transaction alert${result.transactionsPendingReview > 1 ? "s require" : " requires"} your review in Wealth.`,
      actionUrl: "/wealth/accounts",
      idempotencyKey: `pending:gmail:${userId}:${Date.now()}`,
    });
  }

  return result;
}

/**
 * Synchronize Outlook transaction alerts and statements for a user.
 */
export async function syncOutlookUser(
  userId: string,
  options: EmailSyncOptions = {},
): Promise<UserEmailSyncResult> {
  const {
    maxPages = 5,
    autoImportThreshold = 0.9,
    maxPdfsPerSync = 10,
    fullSync = false,
  } = options;

  const result: UserEmailSyncResult = {
    userId,
    provider: "OUTLOOK",
    pagesProcessed: 0,
    emailsScanned: 0,
    emailsClassified: 0,
    transactionsAutoImported: 0,
    transactionsPendingReview: 0,
    documentsDiscovered: 0,
    remindersAutoImported: 0,
    remindersPendingReview: 0,
    pdfsProcessed: 0,
    hasMorePages: false,
    errors: [],
  };

  const connection = await prisma.outlookConnection.findUnique({ where: { ownerId: userId } });
  if (!connection || connection.status !== "CONNECTED") {
    console.warn(`[OUTLOOK] User ${userId} has no active/connected Outlook integration.`);
    result.errors.push("Outlook not connected or inactive.");
    return result;
  }

  console.log(`[OUTLOOK] Starting Outlook sync for user ${userId} (${connection.emailAddress})...`);

  let tokens: { accessToken: string; refreshToken: string };
  try {
    tokens = await refreshOutlookAccessToken(connection.refreshTokenEncrypted);
    if (tokens.refreshToken) {
      const { encryptOutlookRefreshToken } = await import("@/lib/outlook/oauth");
      await prisma.outlookConnection.update({
        where: { ownerId: userId },
        data: { refreshTokenEncrypted: encryptOutlookRefreshToken(tokens.refreshToken) },
      });
    }
  } catch {
    await prisma.outlookConnection.update({
      where: { ownerId: userId },
      data: { status: "RECONNECT_REQUIRED" },
    });
    console.error(`[OUTLOOK] Token refresh failed for user ${userId}. Reconnect required.`);
    result.errors.push("Outlook token refresh failed. Reconnect required.");
    return result;
  }

  const financialAccounts = await prisma.wealthAccount.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      type: true,
      bankName: true,
      provider: true,
      accountNumber: true,
      currency: true,
      currentBalance: true,
    },
  });

  console.log(
    `[OUTLOOK] Loaded ${financialAccounts.length} active Wealth account(s) for matching: ` +
      (financialAccounts.length > 0
        ? financialAccounts
            .map((a) => `${a.name} [***${a.accountNumber?.slice(-4) || "no-num"}]`)
            .join(", ")
        : "None (candidates will queue for manual review)"),
  );

  const [reviewDuplicates, savedTransactions] = await Promise.all([
    prisma.emailTransactionImport.findMany({
      where: { ownerId: userId, status: { in: ["PENDING", "IMPORTED"] } },
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
      where: { account: { ownerId: userId } },
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

  const runningFingerprints: TransactionFingerprint[] = [
    ...reviewDuplicates,
    ...savedTransactions.map((item) => ({
      ...item,
      bankName: item.account.bankName || item.account.name,
    })),
  ];

  console.log(
    `[OUTLOOK] Tracking ${runningFingerprints.length} existing transaction fingerprint(s) (${reviewDuplicates.length} email imports, ${savedTransactions.length} wealth transactions).`,
  );

  let nextLink: string | null = connection.syncPageToken;
  let totalPdfs = 0;

  // Determine whether this sync is full or incremental based on lastSyncedAt
  const isIncremental = !fullSync && Boolean(connection.lastSyncedAt);
  let graphFilter: string | undefined;

  if (isIncremental && connection.lastSyncedAt) {
    const lastDate = new Date(connection.lastSyncedAt);
    const bufferDate = new Date(lastDate.getTime() - 24 * 60 * 60 * 1000);
    graphFilter = `receivedDateTime ge ${bufferDate.toISOString()} and isDraft eq false`;
    console.log(
      `[OUTLOOK] Incremental sync active: fetching messages received on or after ${bufferDate.toISOString().slice(0, 10)} (Last synced: ${connection.lastSyncedAt.toISOString()}).`,
    );
  } else {
    graphFilter = "isDraft eq false";
    console.log(
      `[OUTLOOK] Full mailbox sync active: fetching all non-draft messages without date restriction.`,
    );
  }

  for (let page = 0; page < maxPages; page++) {
    result.pagesProcessed++;
    console.log(
      `[OUTLOOK] [Page ${page + 1}/${maxPages}] Fetching messages from Microsoft Graph (Cursor: ${nextLink ? "provided nextLink" : "initial fetch"}${graphFilter && !nextLink ? `, Filter: ${graphFilter}` : ""})...`,
    );

    let pageData: { messages: OutlookMessage[]; nextLink: string | null };
    try {
      pageData = await getOutlookMessages(tokens.accessToken, nextLink, {
        filter: !nextLink ? graphFilter : undefined,
      });
    } catch (apiErr) {
      const errMsg = apiErr instanceof Error ? apiErr.message : "error";
      console.error(`[OUTLOOK] [Page ${page + 1}] Outlook Graph API fetch error:`, errMsg);
      result.errors.push(`Outlook fetch error: ${errMsg}`);
      break;
    }

    const rawMessages = pageData.messages || [];
    const messages = rawMessages.filter((msg) => {
      if (msg.isDraft) return false;
      const fromAddr = msg.from?.emailAddress?.address?.trim().toLowerCase();
      const connAddr = connection.emailAddress?.trim().toLowerCase();
      if (fromAddr && connAddr && fromAddr === connAddr) return false;
      return true;
    });
    console.log(
      `[OUTLOOK] [Page ${page + 1}] Retrieved ${messages.length} message(s) from Outlook inbox.`,
    );

    if (messages.length === 0) {
      console.log(`[OUTLOOK] [Page ${page + 1}] No further messages found. Reached end of inbox.`);
      if (result.errors.length === 0) {
        await prisma.outlookConnection.update({
          where: { ownerId: userId },
          data: { syncPageToken: null, lastSyncedAt: new Date() },
        });
      } else {
        console.warn(
          `[OUTLOOK] Reached end of messages, but skipping lastSyncedAt update due to ${result.errors.length} active error(s).`,
        );
      }
      result.hasMorePages = false;
      break;
    }

    result.emailsScanned += messages.length;
    const classificationEmails = messages.map(toOutlookClassificationEmail);

    console.log(
      `[OUTLOOK] [Page ${page + 1}/${maxPages}] ── ${classificationEmails.length} email(s) found in Outlook inbox ──`,
    );
    classificationEmails.forEach((email, idx) => {
      const dateStr = email.receivedAt.toISOString().slice(0, 10);
      console.log(
        `[OUTLOOK]   #${idx + 1}. [${email.messageId}] (${dateStr}) From: ${email.from.slice(0, 40)} | Subject: "${email.subject.slice(0, 60)}"`,
      );
    });

    const messageIds = classificationEmails.map((e) => e.messageId);
    const existing = await prisma.emailTransactionImport.findMany({
      where: { ownerId: userId, emailMessageId: { in: messageIds } },
      select: { id: true, emailMessageId: true, status: true },
    });
    const existingSet = new Set(existing.map((e) => e.emailMessageId));
    const toProcess = classificationEmails.filter((e) => !existingSet.has(e.messageId));

    console.log(
      `[OUTLOOK] [Page ${page + 1}] Status check: ${existing.length} already tracked in database, ${toProcess.length} new/unprocessed message(s).`,
    );

    if (toProcess.length > 0) {
      const rankedEmails = rankMultiModuleEmails(toProcess, 30);
      console.log(
        `[OUTLOOK] [Page ${page + 1}/${maxPages}] Filtered ${rankedEmails.length}/${toProcess.length} email(s) across transactions, documents, and reminders to send for AI processing.`,
      );

      // PDF statement extraction
      for (const email of rankedEmails) {
        if (
          !/(statement|e-statement|account summary|transaction summary|monthly report)/i.test(
            `${email.subject} ${email.body.slice(0, 1200)}`,
          )
        ) {
          continue;
        }
        if (totalPdfs >= maxPdfsPerSync) break;

        const rawId = email.messageId.replace(/^outlook:/, "");
        const msg = messages.find((m) => m.id === rawId);
        if (!msg?.hasAttachments) continue;

        try {
          const attachments = await getOutlookPdfAttachments(tokens.accessToken, rawId);
          if (attachments.length > 0) {
            totalPdfs++;
            result.pdfsProcessed++;
            console.log(
              `[OUTLOOK] [Page ${page + 1}] Found statement PDF attachment(s) in Outlook message "${email.subject.slice(0, 40)}": ${attachments.map((a) => a.filename).join(", ")}. Extracting...`,
            );
            const pdfRes = await processFinancialPdfAttachments(
              {
                ownerId: userId,
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
            console.log(
              `[OUTLOOK] [Page ${page + 1}] Statement PDF extracted: ${pdfRes.extracted} rows, ${pdfRes.added} added to review, ${pdfRes.duplicates} duplicates, ${pdfRes.failed} failed.`,
            );
          }
        } catch (pdfErr) {
          console.warn("[OUTLOOK] Error processing statement PDF:", pdfErr);
        }
      }

      // Gemini multi-module classification
      let classified: ClassifiedGmailTransaction[] = [];
      let multiResult: MultiModuleClassificationResult = {
        transactions: [],
        documents: [],
        reminders: [],
      };
      if (rankedEmails.length > 0) {
        try {
          console.log(
            `[OUTLOOK] [Page ${page + 1}/${maxPages}] Calling Gemini multi-module classification on ${rankedEmails.length} candidate email(s)...`,
          );
          multiResult = await classifyMultiInBatches(rankedEmails, "[OUTLOOK:AI]");
          classified = multiResult.transactions;
          result.emailsClassified += rankedEmails.length;
        } catch (classifyErr) {
          const errMsg = classifyErr instanceof Error ? classifyErr.message : "error";
          console.error(`[OUTLOOK] [Page ${page + 1}] Gemini classification error:`, errMsg);
          result.errors.push(`Gemini classification error: ${errMsg}`);
          break;
        }
      }

      const emailById = new Map(rankedEmails.map((e) => [e.messageId, e]));

      const rawCandidates = classified.flatMap((item) => {
        const email = emailById.get(item.messageId);
        if (!email) return [];
        const lastFour = extractAccountLastFour(`${email.subject}\n${email.body}`);
        const hint = extractAccountNumberHint(`${email.subject}\n${email.body}`);
        const matchedId = matchFinancialAccount(financialAccounts, item.bankName, lastFour, hint);

        const matchedAccount = matchedId ? financialAccounts.find((a) => a.id === matchedId) : null;
        console.log(
          `[OUTLOOK] [Page ${page + 1}] Match candidate [${item.messageId}]: ` +
            `${item.type} ${item.amount} ${item.currency} (${item.merchant || item.bankName || "Unknown"}) ` +
            `| Last4: ${lastFour || "none"} | Matched Account: ${matchedAccount ? `${matchedAccount.name} (${matchedAccount.bankName})` : "UNMATCHED"}`,
        );

        return [
          {
            ownerId: userId,
            emailMessageId: item.messageId,
            threadId: email.threadId || null,
            fromAddress: cleanAddress(email.from) || "unknown",
            subject: email.subject || null,
            accountId: matchedId,
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
            sourceProvider: "OUTLOOK",
          },
        ];
      });

      const uniqueCandidates = removeDuplicateTransactions(rawCandidates, runningFingerprints);
      if (rawCandidates.length > uniqueCandidates.length) {
        console.log(
          `[OUTLOOK] [Page ${page + 1}] Skipped ${rawCandidates.length - uniqueCandidates.length} duplicate transaction(s).`,
        );
      }

      const autoImportCandidates: typeof uniqueCandidates = [];
      const pendingCandidates: typeof uniqueCandidates = [];
      let hasAccountCreationError = false;

      for (const candidate of uniqueCandidates) {
        let matchedAccount = candidate.accountId
          ? financialAccounts.find((a) => a.id === candidate.accountId)
          : null;

        // Dynamic Account Creation:
        // When an alert has high confidence (>= threshold) and genuine bank/card details,
        // but no matching account exists, dynamically provision a new WealthAccount.
        // NOTE: Strictly restricted to verified bank/card institutions - never merchants!
        const verifiedBankName = candidate.bankName?.trim();
        const isMerchantName =
          Boolean(verifiedBankName) &&
          /^(amazon|flipkart|swiggy|zomato|uber|ola|irctc|bigrock|dineout|bookmyshow|makemytrip|cleartrip|netflix|spotify|google|apple|myntra|ebay|shopclues)/i.test(
            verifiedBankName || "",
          );

        if (
          !matchedAccount &&
          (candidate.aiConfidence ?? 0) >= autoImportThreshold &&
          verifiedBankName &&
          !isMerchantName &&
          verifiedBankName !== "Unknown" &&
          verifiedBankName !== "None"
        ) {
          const rawLastFour = extractAccountLastFour(
            `${candidate.subject || ""}\n${candidate.description || ""}`,
          );
          const autoName = formatDiscoveredAccountName(verifiedBankName, null, rawLastFour);

          // Re-check in case an account with matching currency and name was provisioned earlier in this cycle
          const existingDynamic = financialAccounts.find(
            (a) =>
              a.currency === candidate.currency &&
              (a.name.toLowerCase() === autoName.toLowerCase() ||
                (rawLastFour && a.accountNumber?.endsWith(rawLastFour))),
          );

          if (existingDynamic) {
            matchedAccount = existingDynamic;
            candidate.accountId = existingDynamic.id;
          } else {
            const accountType = inferDiscoveredAccountType(
              verifiedBankName,
              candidate.description || "",
            );
            try {
              const created = await prisma.wealthAccount.create({
                data: {
                  ownerId: userId,
                  name: autoName,
                  type: accountType,
                  bankName: verifiedBankName,
                  accountNumber: rawLastFour ? `***${rawLastFour}` : null,
                  currency: candidate.currency,
                  currentBalance: 0,
                  status: "ACTIVE",
                },
                select: {
                  id: true,
                  name: true,
                  type: true,
                  bankName: true,
                  provider: true,
                  accountNumber: true,
                  currency: true,
                  currentBalance: true,
                },
              });

              financialAccounts.push(created);
              matchedAccount = created;
              candidate.accountId = created.id;

              console.log(
                `[OUTLOOK]   ✨ AUTO-PROVISIONED Wealth account "${created.name}" (${created.currency}) for unmatched alert.`,
              );
            } catch (createErr) {
              const errMsg = createErr instanceof Error ? createErr.message : "Database error";
              console.error(
                `[OUTLOOK] Failed to auto-provision account for ${autoName}:`,
                createErr,
              );
              result.errors.push(`Account creation failed for "${autoName}": ${errMsg}`);
              hasAccountCreationError = true;
              break;
            }
          }
        }

        const isAutoImportEligible =
          Boolean(matchedAccount) &&
          matchedAccount?.currency === candidate.currency &&
          (candidate.aiConfidence ?? 0) >= autoImportThreshold;

        if (isAutoImportEligible) {
          autoImportCandidates.push(candidate);
          console.log(
            `[OUTLOOK]   ✓ AUTO-IMPORT candidate: ${candidate.description} | ${candidate.amount} ${candidate.currency} -> ${matchedAccount?.name} (Confidence: ${(candidate.aiConfidence ?? 0).toFixed(2)})`,
          );
        } else {
          pendingCandidates.push(candidate);
          console.log(
            `[OUTLOOK]   ⏳ QUEUE REVIEW candidate: ${candidate.description} | ${candidate.amount} ${candidate.currency} (Reason: ${!candidate.accountId ? "Unmatched account" : `Confidence ${(candidate.aiConfidence ?? 0).toFixed(2)} < threshold ${autoImportThreshold}`})`,
          );
        }
      }

      if (hasAccountCreationError) {
        console.error(
          `[OUTLOOK] [Page ${page + 1}] Halting Outlook sync job due to account creation failure. lastSyncedAt and cursor NOT updated.`,
        );
        break;
      }

      // Persist in transaction in chronological ascending order
      if (autoImportCandidates.length > 0 || pendingCandidates.length > 0) {
        try {
          const chronologicalCandidates = [...autoImportCandidates].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          for (const candidate of chronologicalCandidates) {
            const account = financialAccounts.find((a) => a.id === candidate.accountId)!;
            const delta = getBalanceDelta(account.type, candidate.type, Number(candidate.amount));
            const newBalance = (Number(account.currentBalance) + delta).toFixed(2);
            account.currentBalance = newBalance as unknown as typeof account.currentBalance;

            await prisma.$transaction([
              prisma.wealthTransaction.create({
                data: {
                  accountId: account.id,
                  type: candidate.type,
                  amount: candidate.amount,
                  currency: candidate.currency,
                  description: candidate.description,
                  referenceNumber: candidate.referenceNumber,
                  date: candidate.date,
                  balanceAfter: newBalance,
                  notes: `Auto-imported by email worker from Outlook alert (${candidate.fromAddress}).`,
                },
              }),
              prisma.wealthAccount.update({
                where: { id: account.id },
                data: { currentBalance: newBalance },
              }),
              prisma.emailTransactionImport.upsert({
                where: {
                  ownerId_emailMessageId: {
                    ownerId: userId,
                    emailMessageId: candidate.emailMessageId,
                  },
                },
                create: {
                  ownerId: userId,
                  emailMessageId: candidate.emailMessageId,
                  threadId: candidate.threadId,
                  fromAddress: candidate.fromAddress,
                  subject: candidate.subject,
                  bankName: candidate.bankName,
                  merchant: candidate.merchant,
                  description: candidate.description,
                  amount: candidate.amount,
                  currency: candidate.currency,
                  type: candidate.type,
                  referenceNumber: candidate.referenceNumber,
                  date: candidate.date,
                  accountId: candidate.accountId,
                  status: "IMPORTED",
                  importedAt: new Date(),
                  sourceProvider: "OUTLOOK",
                  aiConfidence: candidate.aiConfidence,
                  aiReason: candidate.aiReason,
                  aiClassifiedAt: new Date(),
                },
                update: {
                  status: "IMPORTED",
                  importedAt: new Date(),
                  accountId: candidate.accountId,
                  aiConfidence: candidate.aiConfidence,
                  aiReason: candidate.aiReason,
                  aiClassifiedAt: new Date(),
                },
              }),
            ]);
          }

          if (pendingCandidates.length > 0) {
            await prisma.emailTransactionImport.createMany({
              data: pendingCandidates.map((c) => ({
                ownerId: userId,
                emailMessageId: c.emailMessageId,
                threadId: c.threadId,
                fromAddress: c.fromAddress,
                subject: c.subject,
                bankName: c.bankName,
                merchant: c.merchant,
                description: c.description,
                amount: c.amount,
                currency: c.currency,
                type: c.type,
                referenceNumber: c.referenceNumber,
                date: c.date,
                accountId: c.accountId,
                status: "PENDING" as const,
                sourceProvider: "OUTLOOK",
                aiConfidence: c.aiConfidence,
                aiReason: c.aiReason,
                aiClassifiedAt: new Date(),
              })),
              skipDuplicates: true,
            });
          }

          console.log(
            `[OUTLOOK] [Page ${page + 1}] Database updated: committed ${autoImportCandidates.length} auto-import(s) and ${pendingCandidates.length} review row(s).`,
          );
        } catch (dbErr) {
          const errMsg = dbErr instanceof Error ? dbErr.message : "Database error";
          console.error(`[OUTLOOK] [Page ${page + 1}] Transaction persistence failed:`, errMsg);
          result.errors.push(`Transaction persistence failed: ${errMsg}`);
          break;
        }
      }

      result.transactionsAutoImported += autoImportCandidates.length;
      result.transactionsPendingReview += pendingCandidates.length;

      for (const item of uniqueCandidates) {
        runningFingerprints.push({
          amount: item.amount,
          currency: item.currency,
          type: item.type,
          date: item.date,
          referenceNumber: item.referenceNumber,
          bankName: item.bankName,
          merchant: item.merchant,
          description: item.description,
        });
      }

      // Persist discovered documents and reminders
      await persistDiscoveredDocumentsAndReminders(
        userId,
        "OUTLOOK",
        multiResult.documents,
        multiResult.reminders,
        emailById,
        autoImportThreshold,
        result,
      );
    }

    if (result.errors.length > 0) {
      console.error(
        `[OUTLOOK] [Page ${page + 1}] Halting Outlook sync job due to error(s). lastSyncedAt and syncPageToken will NOT be updated so unprocessed messages will be retried on the next cycle.`,
      );
      break;
    }

    nextLink = pageData.nextLink;

    if (!nextLink) {
      console.log(
        `[OUTLOOK] [Page ${page + 1}] Reached end of Microsoft Graph messages. Mailbox is fully caught up.`,
      );
      if (result.errors.length === 0) {
        await prisma.outlookConnection.update({
          where: { ownerId: userId },
          data: {
            syncPageToken: null,
            lastSyncedAt: new Date(),
          },
        });
      }
      result.hasMorePages = false;
      break;
    } else {
      console.log(
        `[OUTLOOK] [Page ${page + 1}] Saved next page cursor. More pages exist in folder.`,
      );
      if (result.errors.length === 0) {
        await prisma.outlookConnection.update({
          where: { ownerId: userId },
          data: {
            syncPageToken: nextLink,
            ...(isIncremental ? { lastSyncedAt: new Date() } : {}),
          },
        });
      }
      result.hasMorePages = true;
    }
  }

  console.log(
    `[OUTLOOK] Finished Outlook sync for ${connection.emailAddress}: ` +
      `${result.pagesProcessed} page(s) processed, ${result.emailsScanned} email(s) scanned, ` +
      `${result.transactionsAutoImported} auto-imported, ${result.transactionsPendingReview} queued for review, ` +
      `${result.pdfsProcessed} PDF(s), ${result.errors.length} error(s).`,
  );

  // Notifications and audit logs
  if (result.transactionsAutoImported > 0) {
    await createAuditLog({
      userId,
      action: "EMAIL_TRANSACTION_AUTO_IMPORT",
      metadata: {
        provider: "OUTLOOK",
        count: result.transactionsAutoImported,
      },
    });

    await createNotification({
      userId,
      type: "WEALTH_TRANSACTION_AUTO_IMPORTED" as NotificationType,
      title: "Transactions Auto-Imported",
      message: `${result.transactionsAutoImported} transaction${result.transactionsAutoImported > 1 ? "s were" : " was"} auto-imported from your Outlook alerts.`,
      actionUrl: "/wealth",
      idempotencyKey: `auto-import:outlook:${userId}:${Date.now()}`,
    });
  }

  if (result.transactionsPendingReview > 0) {
    await createNotification({
      userId,
      type: "WEALTH_TRANSACTION_PENDING_REVIEW" as NotificationType,
      title: "New Transactions for Review",
      message: `${result.transactionsPendingReview} transaction alert${result.transactionsPendingReview > 1 ? "s require" : " requires"} your review in Wealth.`,
      actionUrl: "/wealth/accounts",
      idempotencyKey: `pending:outlook:${userId}:${Date.now()}`,
    });
  }

  return result;
}

/**
 * Top-level runner that iterates across all connected Gmail and Outlook
 * user integrations, executing syncs with error isolation.
 */
export async function syncAllEmailConnections(
  options: EmailSyncOptions = {},
): Promise<GlobalEmailSyncResult> {
  const startedAt = new Date();
  const globalResult: GlobalEmailSyncResult = {
    startedAt,
    completedAt: startedAt,
    usersProcessed: 0,
    results: [],
    errors: [],
  };

  try {
    const [gmailConnections, outlookConnections] = await Promise.all([
      prisma.gmailConnection.findMany({
        where: { status: "CONNECTED" },
        select: { ownerId: true, emailAddress: true },
      }),
      prisma.outlookConnection.findMany({
        where: { status: "CONNECTED" },
        select: { ownerId: true, emailAddress: true },
      }),
    ]);

    console.log(
      `[SYNC-ENGINE] Starting global email sync cycle... Found ${gmailConnections.length} Gmail connection(s) and ${outlookConnections.length} Outlook connection(s).`,
    );

    for (const conn of gmailConnections) {
      try {
        console.log(
          `[SYNC-ENGINE] Syncing Gmail account: ${conn.emailAddress} (User: ${conn.ownerId})...`,
        );
        const res = await syncGmailUser(conn.ownerId, options);
        globalResult.results.push(res);
        if (res.errors.length > 0) {
          globalResult.errors.push(...res.errors);
        }
        globalResult.usersProcessed++;
      } catch (err) {
        const message = `Gmail sync failed for user ${conn.ownerId}: ${err instanceof Error ? err.message : "unknown"}`;
        console.error(`[SYNC-ENGINE] ${message}`);
        globalResult.errors.push(message);
      }
    }

    for (const conn of outlookConnections) {
      try {
        console.log(
          `[SYNC-ENGINE] Syncing Outlook account: ${conn.emailAddress} (User: ${conn.ownerId})...`,
        );
        const res = await syncOutlookUser(conn.ownerId, options);
        globalResult.results.push(res);
        if (res.errors.length > 0) {
          globalResult.errors.push(...res.errors);
        }
        globalResult.usersProcessed++;
      } catch (err) {
        const message = `Outlook sync failed for user ${conn.ownerId}: ${err instanceof Error ? err.message : "unknown"}`;
        console.error(`[SYNC-ENGINE] ${message}`);
        globalResult.errors.push(message);
      }
    }
  } catch (error) {
    const msg = `Fatal error in syncAllEmailConnections: ${error instanceof Error ? error.message : "unknown"}`;
    console.error(`[SYNC-ENGINE] ${msg}`);
    globalResult.errors.push(msg);
  } finally {
    globalResult.completedAt = new Date();
    const durationSec = (
      (globalResult.completedAt.getTime() - globalResult.startedAt.getTime()) /
      1000
    ).toFixed(1);
    const totalAutoImported = globalResult.results.reduce(
      (acc, r) => acc + r.transactionsAutoImported,
      0,
    );
    const totalPending = globalResult.results.reduce(
      (acc, r) => acc + r.transactionsPendingReview,
      0,
    );
    const totalDocuments = globalResult.results.reduce(
      (acc, r) => acc + (r.documentsDiscovered || 0),
      0,
    );
    const totalReminders = globalResult.results.reduce(
      (acc, r) => acc + (r.remindersAutoImported || 0) + (r.remindersPendingReview || 0),
      0,
    );
    console.log(
      `[SYNC-ENGINE] Global sync finished in ${durationSec}s: ` +
        `${globalResult.usersProcessed} account(s) processed, ` +
        `${totalAutoImported} auto-imported tx, ${totalPending} queued tx, ` +
        `${totalDocuments} docs discovered, ${totalReminders} reminders, ` +
        `${globalResult.errors.length} fatal error(s).`,
    );
  }

  return globalResult;
}

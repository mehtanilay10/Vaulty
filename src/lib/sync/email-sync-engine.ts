import { prisma } from "@/lib/prisma";
import type { WealthAccountType, ReminderCategory } from "@prisma/client";
import type { GmailEmailForClassification } from "@/lib/gmail/classify-transaction-emails";
import {
  classifyMultiInBatches,
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
  cleanAddress,
  gmailSyncProvider,
  outlookSyncProvider,
  type EmailSyncProvider,
  type ProviderPage,
} from "@/lib/sync/email-sync-provider";
import { createAuditLog } from "@/lib/audit-log";
import { createNotification, type NotificationType } from "@/lib/notifications";
import { getBalanceDelta } from "@/lib/wealth";

// Re-exported for existing consumers (scripts, tests, webhook handlers).
export {
  cleanAddress,
  toOutlookClassificationEmail,
  loadGmailPdfAttachments,
} from "@/lib/sync/email-sync-provider";

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

export { classifyMultiInBatches } from "@/lib/sync/classify-multi-module-emails";

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
 * Shared sync core for email providers (Gmail, Outlook, and future providers).
 * Iterates provider pages, classifies candidate emails with Gemini, and safely
 * separates auto-import transactions (>= threshold confidence + matched account)
 * from pending review candidates.
 */
async function syncEmailProviderUser(
  adapter: EmailSyncProvider,
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

  const tag = `[${adapter.provider}]`;
  const label = adapter.label;

  const result: UserEmailSyncResult = {
    userId,
    provider: adapter.provider,
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

  const connection = await adapter.findConnection(userId);
  if (!connection || connection.status !== "CONNECTED") {
    console.warn(`${tag} User ${userId} has no active/connected ${label} integration.`);
    result.errors.push(`${label} not connected or inactive.`);
    return result;
  }

  console.log(`${tag} Starting ${label} sync for user ${userId} (${connection.emailAddress})...`);

  const auth = await adapter.authenticate(userId, connection);
  if ("error" in auth) {
    result.errors.push(auth.error);
    return result;
  }
  const session = auth.session;

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
    `${tag} Loaded ${financialAccounts.length} active Wealth account(s) for matching: ` +
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
    `${tag} Tracking ${runningFingerprints.length} existing transaction fingerprint(s) (${reviewDuplicates.length} email imports, ${savedTransactions.length} wealth transactions).`,
  );

  let cursor: string | null = connection.syncPageToken;
  let totalPdfs = 0;

  // Determine whether this sync is full or incremental based on lastSyncedAt
  const isIncremental = !fullSync && Boolean(connection.lastSyncedAt);

  if (isIncremental && connection.lastSyncedAt) {
    console.log(
      `${tag} Incremental sync active: processing emails received after ${connection.lastSyncedAt.toISOString().slice(0, 10)} (Last synced: ${connection.lastSyncedAt.toISOString()}).`,
    );
  } else {
    console.log(`${tag} Full mailbox sync active: fetching without date restriction.`);
  }

  for (let page = 0; page < maxPages; page++) {
    result.pagesProcessed++;

    console.log(
      `${tag} [Page ${page + 1}/${maxPages}] Fetching messages (Cursor: ${cursor ? "active" : "none"})...`,
    );

    let pageData: ProviderPage;
    try {
      pageData = await adapter.listPage(session, {
        cursor,
        lookbackDays,
        isIncremental,
        lastSyncedAt: connection.lastSyncedAt,
        connectionEmail: connection.emailAddress,
      });
    } catch (apiError) {
      const msg = apiError instanceof Error ? apiError.message : `${label} API error`;
      console.error(`${tag} [Page ${page + 1}] Fetch error:`, msg);
      result.errors.push(`${label} fetch error: ${msg}`);
      break;
    }

    if (pageData.empty) {
      console.log(`${tag} [Page ${page + 1}] No further messages found. Reached end of inbox.`);
      if (result.errors.length === 0) {
        await adapter.saveCursor(userId, null, new Date());
      } else {
        console.warn(
          `${tag} Reached end of messages, but skipping lastSyncedAt update due to ${result.errors.length} active error(s).`,
        );
      }
      result.hasMorePages = false;
      break;
    }

    result.emailsScanned += pageData.scannedCount;

    // Only fetch/inspect messages not already tracked in the database.
    const pageEmailIds = pageData.emails
      ? pageData.emails.map((email) => email.messageId)
      : (pageData.messageIds ?? []);

    const existing = pageEmailIds.length
      ? await prisma.emailTransactionImport.findMany({
          where: { ownerId: userId, emailMessageId: { in: pageEmailIds } },
          select: { id: true, emailMessageId: true, status: true, aiClassifiedAt: true },
        })
      : [];
    const existingById = new Map(existing.map((item) => [item.emailMessageId, item]));
    const unprocessedIdSet = new Set(pageEmailIds.filter((id) => !existingById.has(id)));

    console.log(
      `${tag} [Page ${page + 1}] Status check: ${existingById.size} message(s) already processed in database, ${unprocessedIdSet.size} new message(s) to fetch and inspect.`,
    );

    let fetchedEmails: GmailEmailForClassification[] = [];
    if (unprocessedIdSet.size > 0) {
      try {
        console.log(
          `${tag} [Page ${page + 1}] Fetching full content for ${unprocessedIdSet.size} email(s)...`,
        );
        fetchedEmails = pageData.emails
          ? pageData.emails.filter((email) => unprocessedIdSet.has(email.messageId))
          : await adapter.fetchEmails(session, [...unprocessedIdSet]);
      } catch (loadErr) {
        const errorMsg = loadErr instanceof Error ? loadErr.message : "error";
        console.error(`${tag} [Page ${page + 1}] Failed to load email batch:`, errorMsg);
        result.errors.push(`Failed to load email batch: ${errorMsg}`);
        break;
      }
    }

    console.log(
      `${tag} [Page ${page + 1}/${maxPages}] ── ${fetchedEmails.length} email(s) found on page ──`,
    );
    fetchedEmails.forEach((email, idx) => {
      const dateStr = email.receivedAt.toISOString().slice(0, 10);
      const fromInfo =
        process.env.NODE_ENV === "production" ? "[REDACTED]" : email.from.slice(0, 40);
      const subjectInfo =
        process.env.NODE_ENV === "production" ? "[REDACTED]" : `"${email.subject.slice(0, 60)}"`;
      console.log(
        `${tag}   #${idx + 1}. [${email.messageId}] (${dateStr}) From: ${fromInfo} | Subject: ${subjectInfo}`,
      );
    });

    const rankedEmails = rankMultiModuleEmails(fetchedEmails, 30);
    console.log(
      `${tag} [Page ${page + 1}/${maxPages}] Filtered ${rankedEmails.length}/${fetchedEmails.length} email(s) across transactions, documents, and reminders to send for AI processing.`,
    );

    // Statement attachments: PDFs are downloaded only for locally selected
    // financial emails. Contents and password candidates stay server-side.
    for (const email of rankedEmails) {
      if (
        !/(statement|e-statement|account summary|transaction summary|monthly report)/i.test(
          `${email.subject} ${email.body.slice(0, 1200)}`,
        )
      )
        continue;
      if (totalPdfs >= maxPdfsPerSync) break;

      try {
        const attachments = await adapter.getStatementAttachments(session, email);
        if (attachments.length > 0) {
          totalPdfs++;
          result.pdfsProcessed++;
          console.log(
            `${tag} [Page ${page + 1}] Found statement PDF attachment(s) in email "${email.subject.slice(0, 40)}": ${attachments.map((a) => a.filename).join(", ")}. Extracting...`,
          );
          const pdfRes = await processFinancialPdfAttachments(
            {
              ownerId: userId,
              provider: adapter.provider,
              messageId: adapter.nativeMessageId(email.messageId),
              threadId: email.threadId,
              from: email.from,
              subject: email.subject,
              body: email.body,
              receivedAt: email.receivedAt,
            },
            attachments,
          );
          console.log(
            `${tag} [Page ${page + 1}] Statement PDF extracted: ${pdfRes.extracted} rows, ${pdfRes.added} added to review, ${pdfRes.duplicates} duplicates, ${pdfRes.failed} failed.`,
          );
        }
      } catch (pdfErr) {
        console.warn(`${tag} Error processing statement PDF:`, pdfErr);
      }
    }

    // Gemini multi-module classification
    let multiResult: MultiModuleClassificationResult = {
      transactions: [],
      documents: [],
      reminders: [],
    };
    if (rankedEmails.length > 0) {
      try {
        console.log(
          `${tag} [Page ${page + 1}/${maxPages}] Calling Gemini multi-module classification on ${rankedEmails.length} candidate email(s)...`,
        );
        multiResult = await classifyMultiInBatches(rankedEmails, `${tag}:AI`);
        result.emailsClassified += rankedEmails.length;
      } catch (classifyErr) {
        const errMsg = classifyErr instanceof Error ? classifyErr.message : "error";
        console.error(`${tag} [Page ${page + 1}] Gemini classification error:`, errMsg);
        result.errors.push(`Gemini classification error: ${errMsg}`);
        break;
      }
    }
    const classified = multiResult.transactions;

    const emailById = new Map(rankedEmails.map((e) => [e.messageId, e]));

    const rawCandidates = classified.flatMap((item) => {
      const email = emailById.get(item.messageId);
      if (!email) return [];
      const lastFour = extractAccountLastFour(`${email.subject}\n${email.body}`);
      const hint = extractAccountNumberHint(`${email.subject}\n${email.body}`);
      const matchedId = matchFinancialAccount(financialAccounts, item.bankName, lastFour, hint);

      const matchedAccount = matchedId ? financialAccounts.find((a) => a.id === matchedId) : null;
      console.log(
        `${tag} [Page ${page + 1}] Match candidate [${item.messageId}]: ` +
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
          sourceProvider: adapter.provider,
        },
      ];
    });

    const uniqueCandidates = removeDuplicateTransactions(rawCandidates, runningFingerprints);
    if (rawCandidates.length > uniqueCandidates.length) {
      console.log(
        `${tag} [Page ${page + 1}] Skipped ${rawCandidates.length - uniqueCandidates.length} duplicate transaction(s).`,
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
              `${tag}   ✨ AUTO-PROVISIONED Wealth account "${created.name}" (${created.currency}) for unmatched alert.`,
            );
          } catch (createErr) {
            const errMsg = createErr instanceof Error ? createErr.message : "Database error";
            console.error(`${tag} Failed to auto-provision account for ${autoName}:`, createErr);
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
          `${tag}   ✓ AUTO-IMPORT candidate: ${candidate.description} | ${candidate.amount} ${candidate.currency} -> ${matchedAccount?.name} (Confidence: ${(candidate.aiConfidence ?? 0).toFixed(2)})`,
        );
      } else {
        pendingCandidates.push(candidate);
        console.log(
          `${tag}   ⏳ QUEUE REVIEW candidate: ${candidate.description} | ${candidate.amount} ${candidate.currency} (Reason: ${!candidate.accountId ? "Unmatched account" : `Confidence ${(candidate.aiConfidence ?? 0).toFixed(2)} < threshold ${autoImportThreshold}`})`,
        );
      }
    }

    if (hasAccountCreationError) {
      console.error(
        `${tag} [Page ${page + 1}] Halting ${label} sync job due to account creation failure. lastSyncedAt and cursor NOT updated.`,
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
                notes: `Auto-imported by email worker from ${label} alert (${candidate.fromAddress}).`,
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
                sourceProvider: adapter.provider,
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
              sourceProvider: adapter.provider,
              aiConfidence: c.aiConfidence,
              aiReason: c.aiReason,
              aiClassifiedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }

        console.log(
          `${tag} [Page ${page + 1}] Database updated: committed ${autoImportCandidates.length} auto-import(s) and ${pendingCandidates.length} review row(s).`,
        );
      } catch (dbErr) {
        const errMsg = dbErr instanceof Error ? dbErr.message : "Database error";
        console.error(`${tag} [Page ${page + 1}] Transaction persistence failed:`, errMsg);
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
      adapter.provider,
      multiResult.documents,
      multiResult.reminders,
      emailById,
      autoImportThreshold,
      result,
    );

    if (result.errors.length > 0) {
      console.error(
        `${tag} [Page ${page + 1}] Halting ${label} sync job due to error(s). lastSyncedAt and syncPageToken will NOT be updated so unprocessed messages will be retried on the next cycle.`,
      );
      break;
    }

    cursor = pageData.nextCursor;

    if (!cursor) {
      console.log(
        `${tag} [Page ${page + 1}] Reached end of ${label} messages. Mailbox is fully caught up.`,
      );
      if (result.errors.length === 0) {
        await adapter.saveCursor(userId, null, new Date());
      }
      result.hasMorePages = false;
      break;
    } else {
      console.log(`${tag} [Page ${page + 1}] Saved next page cursor. More pages exist.`);
      if (result.errors.length === 0) {
        await adapter.saveCursor(userId, cursor, isIncremental ? new Date() : undefined);
      }
      result.hasMorePages = true;
    }
  }

  console.log(
    `${tag} Finished ${label} sync for ${connection.emailAddress}: ` +
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
        provider: adapter.provider,
        count: result.transactionsAutoImported,
      },
    });

    await createNotification({
      userId,
      type: "WEALTH_TRANSACTION_AUTO_IMPORTED" as NotificationType,
      title: "Transactions Auto-Imported",
      message: `${result.transactionsAutoImported} transaction${result.transactionsAutoImported > 1 ? "s were" : " was"} auto-imported from your ${label} alerts.`,
      actionUrl: "/wealth",
      idempotencyKey: `auto-import:${adapter.provider.toLowerCase()}:${userId}:${Date.now()}`,
    });
  }

  if (result.transactionsPendingReview > 0) {
    await createNotification({
      userId,
      type: "WEALTH_TRANSACTION_PENDING_REVIEW" as NotificationType,
      title: "New Transactions for Review",
      message: `${result.transactionsPendingReview} transaction alert${result.transactionsPendingReview > 1 ? "s require" : " requires"} your review in Wealth.`,
      actionUrl: "/wealth/accounts",
      idempotencyKey: `pending:${adapter.provider.toLowerCase()}:${userId}:${Date.now()}`,
    });
  }

  return result;
}

/**
 * Synchronize Gmail transaction alerts and statements for a user.
 */
export async function syncGmailUser(
  userId: string,
  options: EmailSyncOptions = {},
): Promise<UserEmailSyncResult> {
  return syncEmailProviderUser(gmailSyncProvider, userId, options);
}

/**
 * Synchronize Outlook transaction alerts and statements for a user.
 */
export async function syncOutlookUser(
  userId: string,
  options: EmailSyncOptions = {},
): Promise<UserEmailSyncResult> {
  return syncEmailProviderUser(outlookSyncProvider, userId, options);
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

    const batches: Array<{ adapter: EmailSyncProvider; connections: typeof gmailConnections }> = [
      { adapter: gmailSyncProvider, connections: gmailConnections },
      { adapter: outlookSyncProvider, connections: outlookConnections },
    ];

    for (const { adapter, connections } of batches) {
      for (const conn of connections) {
        try {
          console.log(
            `[SYNC-ENGINE] Syncing ${adapter.label} account: ${conn.emailAddress} (User: ${conn.ownerId})...`,
          );
          const res = await syncEmailProviderUser(adapter, conn.ownerId, options);
          globalResult.results.push(res);
          if (res.errors.length > 0) {
            globalResult.errors.push(...res.errors);
          }
          globalResult.usersProcessed++;
        } catch (err) {
          const message = `${adapter.label} sync failed for user ${conn.ownerId}: ${err instanceof Error ? err.message : "unknown"}`;
          console.error(`[SYNC-ENGINE] ${message}`);
          globalResult.errors.push(message);
        }
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

import { prisma } from "@/lib/prisma";
import { Prisma, type ReminderCategory } from "@prisma/client";
import type {
  GmailEmailForClassification,
  ClassifiedGmailTransaction,
} from "@/lib/gmail/classify-transaction-emails";
import type { MultiModuleClassificationResult } from "@/lib/sync/classify-multi-module-emails";
import {
  removeDuplicateTransactions,
  type TransactionFingerprint,
} from "@/lib/gmail/dedupe-transactions";
import { areDuplicateDocuments, areDuplicateReminders } from "@/lib/sync/dedupe-email-items";
import {
  extractAccountLastFour,
  extractAccountNumberHint,
  matchFinancialAccount,
  type FinancialAccountMatchCandidate,
} from "@/lib/gmail/account-matching";
import { cleanAddress, type EmailProviderName } from "@/lib/sync/email-sync-provider";
import { processFinancialPdfAttachments } from "@/lib/email-statement-attachments";
import type { StatementAttachment } from "@/lib/sync/email-sync-provider";

/** Active wealth accounts used for transaction-to-account matching. */
export async function loadSyncFinancialAccounts(ownerId: string) {
  return prisma.wealthAccount.findMany({
    where: { ownerId, status: "ACTIVE" },
    select: { id: true, name: true, bankName: true, provider: true, accountNumber: true },
  });
}

/** Existing transaction fingerprints used to suppress duplicate imports. */
export async function loadTransactionFingerprints(
  ownerId: string,
): Promise<TransactionFingerprint[]> {
  const [reviewDuplicates, savedTransactions] = await Promise.all([
    prisma.emailTransactionImport.findMany({
      where: { ownerId, status: { in: ["PENDING", "IMPORTED"] } },
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
      where: { account: { ownerId } },
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
  return [
    ...reviewDuplicates,
    ...savedTransactions.map((item) => ({
      ...item,
      bankName: item.account.bankName || item.account.name,
    })),
  ];
}

export interface ExistingImportRecord {
  id: string;
  emailMessageId: string;
  status: string;
  aiClassifiedAt: Date | null;
}

/** Legacy PENDING rows without AI classification that may be refreshed. */
export function legacyPendingByMessageId(
  existing: ExistingImportRecord[],
): Map<string, ExistingImportRecord> {
  return new Map(
    existing
      .filter((item) => item.status === "PENDING" && item.aiClassifiedAt === null)
      .map((item) => [item.emailMessageId, item]),
  );
}

export interface EmailTransactionCandidate {
  ownerId: string;
  emailMessageId: string;
  threadId: string | null;
  fromAddress: string;
  subject: string | null;
  accountId: string | null;
  bankName: string | null;
  merchant: string | null;
  description: string;
  amount: number;
  currency: string;
  type: ClassifiedGmailTransaction["type"];
  referenceNumber: string | null;
  date: Date;
  aiConfidence: number | null;
  aiReason: string | null;
  sourceProvider: EmailProviderName;
  aiClassifiedAt: Date;
}

/** Build review-queue transaction candidates from classified emails. */
export function buildTransactionCandidates(args: {
  ownerId: string;
  provider: EmailProviderName;
  classified: ClassifiedGmailTransaction[];
  emailById: Map<string, GmailEmailForClassification>;
  financialAccounts: FinancialAccountMatchCandidate[];
  trackedMessageIds: Set<string>;
}): EmailTransactionCandidate[] {
  const { ownerId, provider, classified, emailById, financialAccounts, trackedMessageIds } = args;
  return classified.flatMap((item) => {
    if (trackedMessageIds.has(item.messageId)) return [];
    const email = emailById.get(item.messageId);
    if (!email) return [];
    return [
      {
        ownerId,
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
        sourceProvider: provider,
        aiClassifiedAt: new Date(),
      },
    ];
  });
}

/** Remove transaction candidates that duplicate existing review/imported rows. */
export function dedupeTransactionCandidates(
  candidates: EmailTransactionCandidate[],
  fingerprints: TransactionFingerprint[],
) {
  return removeDuplicateTransactions(candidates, fingerprints);
}

/**
 * Refresh or remove legacy PENDING import rows inside a transaction.
 * Rows whose message was re-classified get updated fields; rows that are no
 * longer classified are deleted.
 */
export async function reconcileLegacyPendingImports(
  tx: Prisma.TransactionClient,
  args: {
    ownerId: string;
    legacyByMessageId: Map<string, ExistingImportRecord>;
    classifiedById: Map<string, ClassifiedGmailTransaction>;
  },
): Promise<{ removed: number; updated: number }> {
  const { ownerId, legacyByMessageId, classifiedById } = args;
  let removed = 0;
  let updated = 0;
  for (const [messageId, legacy] of legacyByMessageId) {
    const item = classifiedById.get(messageId);
    if (!item) {
      const res = await tx.emailTransactionImport.deleteMany({
        where: { id: legacy.id, ownerId, status: "PENDING", aiClassifiedAt: null },
      });
      removed += res.count;
      continue;
    }
    await tx.emailTransactionImport.updateMany({
      where: { id: legacy.id, ownerId, status: "PENDING", aiClassifiedAt: null },
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
  return { removed, updated };
}

/** Insert deduplicated candidates as PENDING review rows inside a transaction. */
export async function insertReviewCandidates(
  tx: Prisma.TransactionClient,
  args: {
    ownerId: string;
    provider: EmailProviderName;
    candidates: EmailTransactionCandidate[];
  },
): Promise<number> {
  const { provider, candidates } = args;
  if (candidates.length === 0) return 0;
  const result = await tx.emailTransactionImport.createMany({
    data: candidates.map((c) => ({
      ownerId: c.ownerId,
      emailMessageId: c.emailMessageId,
      threadId: c.threadId,
      fromAddress: c.fromAddress,
      subject: c.subject,
      accountId: c.accountId,
      bankName: c.bankName,
      merchant: c.merchant,
      description: c.description,
      amount: c.amount,
      currency: c.currency,
      type: c.type,
      referenceNumber: c.referenceNumber,
      date: c.date,
      status: "PENDING" as const,
      sourceProvider: provider,
      aiConfidence: c.aiConfidence,
      aiReason: c.aiReason,
      aiClassifiedAt: c.aiClassifiedAt,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Persist discovered document and reminder candidates into their review
 * queues, skipping duplicates against existing pending/imported rows.
 */
export async function persistDiscoveredEmailImports(args: {
  ownerId: string;
  provider: EmailProviderName;
  documents: MultiModuleClassificationResult["documents"];
  reminders: MultiModuleClassificationResult["reminders"];
  emailById: Map<string, GmailEmailForClassification>;
}): Promise<{ documentsAdded: number; remindersAdded: number }> {
  const { ownerId, provider, documents, reminders, emailById } = args;

  const existingDocs = await prisma.emailDocumentImport.findMany({
    where: { ownerId, status: { in: ["PENDING", "IMPORTED"] } },
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
    where: { ownerId, status: { in: ["PENDING", "IMPORTED"] } },
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
      docsToCreate.push({
        ownerId,
        emailMessageId: doc.messageId,
        sourceProvider: provider,
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

  const remsToCreate = [];
  for (const rem of reminders) {
    const email = emailById.get(rem.messageId);
    if (!email) continue;
    const isDuplicate = existingRems.some(
      (er) =>
        er.emailMessageId === rem.messageId ||
        areDuplicateReminders({ title: rem.title, dueAt: rem.dueAt, amount: rem.amount }, er),
    );
    if (!isDuplicate) {
      remsToCreate.push({
        ownerId,
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

  return { documentsAdded: docsToCreate.length, remindersAdded: remsToCreate.length };
}

export interface StatementAttachmentStats {
  attachments: number;
  extracted: number;
  added: number;
  duplicates: number;
  failed: number;
}

const STATEMENT_EMAIL_PATTERN =
  /(statement|e-statement|account summary|transaction summary|monthly report)/i;

/**
 * Download statement-like PDF attachments for ranked emails and run local
 * statement extraction. Provider-specific fetching is injected via
 * `fetchAttachments`; `messageIdFor` maps classification ids back to the
 * provider-native id stored on import records.
 */
export async function extractStatementPdfsFromEmails(args: {
  ownerId: string;
  provider: EmailProviderName;
  emails: GmailEmailForClassification[];
  fetchAttachments: (email: GmailEmailForClassification) => Promise<StatementAttachment[]>;
  messageIdFor: (classificationId: string) => string;
  maxPdfs?: number;
  logPrefix?: string;
}): Promise<{ stats: StatementAttachmentStats; pdfsProcessed: number }> {
  const {
    ownerId,
    provider,
    emails,
    fetchAttachments,
    messageIdFor,
    maxPdfs = 10,
    logPrefix = "[EMAIL-SYNC]",
  } = args;

  const stats: StatementAttachmentStats = {
    attachments: 0,
    extracted: 0,
    added: 0,
    duplicates: 0,
    failed: 0,
  };
  let pdfsProcessed = 0;

  for (const email of emails) {
    if (!STATEMENT_EMAIL_PATTERN.test(`${email.subject} ${email.body.slice(0, 1200)}`)) continue;
    if (pdfsProcessed >= maxPdfs) {
      console.warn(
        `${logPrefix} Reached PDF processing limit (${maxPdfs}), skipping remaining PDFs.`,
      );
      break;
    }
    const attachments = await fetchAttachments(email);
    if (attachments.length > 0) {
      pdfsProcessed += 1;
      const result = await processFinancialPdfAttachments(
        {
          ownerId,
          provider,
          messageId: messageIdFor(email.messageId),
          threadId: email.threadId || null,
          from: email.from,
          subject: email.subject,
          body: email.body,
          receivedAt: email.receivedAt,
        },
        attachments,
      );
      stats.attachments += result.attachments;
      stats.extracted += result.extracted;
      stats.added += result.added;
      stats.duplicates += result.duplicates;
      stats.failed += result.failed;
    }
  }

  return { stats, pdfsProcessed };
}

import { prisma } from "@/lib/prisma";
import { AiJobStatus, AiProcessing, AiStatus, Prisma } from "@prisma/client";
import { AI_MAX_RETRIES } from "./config";
import { calculateRetrySchedule, shouldRetry } from "./retry";

export interface AiJob {
  id: string;
  documentId: string;
  status: AiJobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastHeartbeatAt: Date | null;
  lastError: string | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function ensureAiJobInTransaction(
  tx: Prisma.TransactionClient,
  documentId: string,
): Promise<AiJob> {
  await tx.$executeRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;

  const existing = await tx.aiJob.findFirst({
    where: {
      documentId,
      status: { in: [AiJobStatus.QUEUED, AiJobStatus.PROCESSING] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return existing as AiJob;
  }

  return tx.aiJob.create({
    data: {
      documentId,
      status: AiJobStatus.QUEUED,
      maxAttempts: AI_MAX_RETRIES,
    },
  });
}

async function ensureAiProcessingInTransaction(
  tx: Prisma.TransactionClient,
  documentId: string,
  modelUsed: string,
): Promise<AiProcessing> {
  return tx.aiProcessing.upsert({
    where: { documentId },
    update: {
      status: AiStatus.QUEUED,
      errorMessage: null,
    },
    create: {
      documentId,
      status: AiStatus.QUEUED,
      modelUsed,
    },
  });
}

export async function ensureAiJob(documentId: string): Promise<AiJob> {
  return prisma.$transaction((tx) => ensureAiJobInTransaction(tx, documentId));
}

export async function ensureAiProcessing(
  documentId: string,
  modelUsed: string,
): Promise<AiProcessing> {
  return prisma.$transaction((tx) => ensureAiProcessingInTransaction(tx, documentId, modelUsed));
}

/** Create/refresh the AI job and processing state atomically for one document. */
export async function ensureAiJobAndProcessing(
  documentId: string,
  modelUsed: string,
): Promise<{ job: AiJob; aiProcessing: AiProcessing }> {
  return prisma.$transaction(async (tx) => {
    const job = await ensureAiJobInTransaction(tx, documentId);
    const aiProcessing = await ensureAiProcessingInTransaction(tx, documentId, modelUsed);
    return { job, aiProcessing };
  });
}

export interface BulkAiQueueResult {
  queuedDocumentIds: string[];
  activeJobs: Array<{ documentId: string; status: AiJobStatus }>;
}

/**
 * Queue AI processing for multiple documents in one transaction. Documents
 * that already have an active job are reported back instead of being queued
 * twice.
 */
export async function ensureAiJobsAndProcessing(
  documentIds: string[],
  modelUsed: string,
): Promise<BulkAiQueueResult> {
  const uniqueIds = Array.from(new Set(documentIds));
  if (uniqueIds.length === 0) {
    return { queuedDocumentIds: [], activeJobs: [] };
  }

  return prisma.$transaction(
    async (tx) => {
      const lockedDocuments = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Document"
      WHERE id IN (${Prisma.join(uniqueIds)})
      FOR UPDATE
    `;
      const existingIds = new Set(lockedDocuments.map((document) => document.id));
      const candidateIds = uniqueIds.filter((documentId) => existingIds.has(documentId));

      if (candidateIds.length === 0) {
        return { queuedDocumentIds: [], activeJobs: [] };
      }

      const activeJobs = await tx.aiJob.findMany({
        where: {
          documentId: { in: candidateIds },
          status: { in: [AiJobStatus.QUEUED, AiJobStatus.PROCESSING] },
        },
        select: { documentId: true, status: true },
        orderBy: { createdAt: "desc" },
      });

      const activeDocumentIds = new Set(activeJobs.map((job) => job.documentId));
      const queuedDocumentIds = candidateIds.filter(
        (documentId) => !activeDocumentIds.has(documentId),
      );

      if (queuedDocumentIds.length > 0) {
        await tx.aiJob.createMany({
          data: queuedDocumentIds.map((documentId) => ({
            documentId,
            status: AiJobStatus.QUEUED,
            maxAttempts: AI_MAX_RETRIES,
          })),
        });

        await tx.aiProcessing.createMany({
          data: queuedDocumentIds.map((documentId) => ({
            documentId,
            status: AiStatus.QUEUED,
            modelUsed,
          })),
          skipDuplicates: true,
        });

        await tx.aiProcessing.updateMany({
          where: { documentId: { in: queuedDocumentIds } },
          data: { status: AiStatus.QUEUED, errorMessage: null },
        });
      }

      return { queuedDocumentIds, activeJobs };
    },
    { timeout: 15000, maxWait: 5000 },
  );
}

export async function claimNextAiJob(workerId: string): Promise<AiJob | null> {
  const now = new Date();

  const claimed = await prisma.$transaction(
    async (tx) => {
      const jobs = await tx.$queryRaw<AiJob[]>`
      SELECT * FROM "AiJob"
      WHERE status = 'QUEUED'
        AND "availableAt" <= NOW()
      ORDER BY "availableAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

      if (jobs.length === 0) return null;

      const [updated] = await tx.$queryRaw<AiJob[]>`
      UPDATE "AiJob"
      SET status = 'PROCESSING',
          attempts = attempts + 1,
          "startedAt" = ${now},
          "lockedAt" = ${now},
          "lockedBy" = ${workerId},
          "lastHeartbeatAt" = ${now},
          "updatedAt" = ${now}
      WHERE id = ${jobs[0].id}
        AND status = 'QUEUED'
      RETURNING *
    `;

      return updated || null;
    },
    { timeout: 10000, maxWait: 5000 },
  );

  return claimed;
}

export async function markJobCompleted(
  jobId: string,
  result: {
    extractedText: string;
    summaryMarkdown: string;
    interpretationMarkdown: string;
    documentMetadata: {
      documentType: string | null;
      expiryDate: string | null;
      expiryDateConfidence: number;
      expiryDateEvidence: string | null;
      importantDates: Array<{
        type: string;
        date: string;
        confidence: number;
        evidence: string | null;
      }>;
    };
    textFileId: string | null;
    summaryFileId: string | null;
    interpretationFileId: string | null;
  },
) {
  const completedAt = new Date();

  await prisma.$transaction(
    async (tx) => {
      const job = await tx.aiJob.findUnique({ where: { id: jobId } });
      if (!job) return;

      await tx.aiJob.update({
        where: { id: jobId },
        data: {
          status: AiJobStatus.COMPLETED,
          completedAt,
          lockedAt: null,
          lockedBy: null,
        },
      });

      const aiProcessing = await tx.aiProcessing.findUnique({
        where: { documentId: job.documentId },
      });

      if (aiProcessing) {
        await tx.aiProcessing.update({
          where: { id: aiProcessing.id },
          data: {
            status: AiStatus.COMPLETED,
            extractedText: result.extractedText,
            summaryMarkdown: result.summaryMarkdown,
            interpretationMarkdown: result.interpretationMarkdown,
            extractedMetadata: result.documentMetadata,
            processedAt: completedAt,
            errorMessage: null,
          },
        });
      }

      const extractedExpiry = result.documentMetadata?.expiryDate;
      const confidence = result.documentMetadata?.expiryDateConfidence ?? 0;
      const evidence = result.documentMetadata?.expiryDateEvidence?.trim();
      if (extractedExpiry && confidence >= 0.85 && evidence) {
        const parsedExpiry = /^\d{4}-\d{2}-\d{2}$/.test(extractedExpiry)
          ? new Date(`${extractedExpiry}T12:00:00.000Z`)
          : new Date("invalid");
        const isoExpiry = !Number.isNaN(parsedExpiry.getTime()) ? parsedExpiry.toISOString() : null;
        const isCalendarDate =
          isoExpiry !== null &&
          (isoExpiry.length >= 10 ? isoExpiry.slice(0, 10) : isoExpiry) === extractedExpiry;
        if (isCalendarDate) {
          await tx.document.updateMany({
            where: { id: job.documentId, expiryDate: null },
            data: { expiryDate: parsedExpiry },
          });
        }
      }

      // Convert explicitly extracted, high-confidence financial deadlines into
      // user reminders. Evidence stays in private database metadata, never logs.
      const document = await tx.document.findUnique({
        where: { id: job.documentId },
        select: { ownerId: true, name: true },
      });
      const importantDates = result.documentMetadata?.importantDates ?? [];
      if (document) {
        for (const item of importantDates) {
          if (item.confidence < 0.85 || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
          const dueAt = new Date(`${item.date}T12:00:00.000Z`);
          const dueAtIso = !Number.isNaN(dueAt.getTime()) ? dueAt.toISOString() : null;
          if (!dueAtIso || (dueAtIso.length >= 10 ? dueAtIso.slice(0, 10) : dueAtIso) !== item.date)
            continue;
          const rawType = (item.type || "").trim();
          const typeSnippet = rawType.length > 70 ? rawType.slice(0, 70) : rawType;
          const rawDocName = (document.name || "").trim();
          const docNameSnippet = rawDocName.length > 100 ? rawDocName.slice(0, 100) : rawDocName;
          const title = `${typeSnippet} · ${docNameSnippet}`;
          const exists = await tx.reminder.findFirst({
            where: { userId: document.ownerId, title, dueAt },
            select: { id: true },
          });
          if (!exists) {
            const type = item.type.toLowerCase();
            const category =
              type.includes("insurance") || type.includes("premium") || type.includes("policy")
                ? "INSURANCE"
                : type.includes("subscription")
                  ? "SUBSCRIPTION"
                  : type.includes("payment") || type.includes("due")
                    ? "PAYMENT"
                    : "DOCUMENT";
            const rawDescription = `Extracted from ${document.name}. Confidence: ${Math.round(item.confidence * 100)}%. Evidence: ${item.evidence || "No supporting excerpt supplied."}`;
            const description =
              rawDescription.length > 2000 ? rawDescription.slice(0, 2000) : rawDescription;
            await tx.reminder.create({
              data: {
                userId: document.ownerId,
                title,
                category,
                dueAt,
                description,
                notifyDaysBefore: [7, 1, 0],
              },
            });
          }
        }
      }

      if (result.textFileId || result.summaryFileId || result.interpretationFileId) {
        await tx.document.update({
          where: { id: job.documentId },
          data: {
            googleDriveSummaryFileId: result.summaryFileId,
            googleDriveTextFileId: result.textFileId,
            googleDriveInterpretationFileId: result.interpretationFileId,
          },
        });
      }
    },
    { timeout: 30000, maxWait: 5000 },
  );
}

export async function markJobFailed(jobId: string, error: { code: string; message: string }) {
  const failedAt = new Date();
  const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  if (shouldRetry(error, job.attempts, job.maxAttempts)) {
    const schedule = calculateRetrySchedule(job.attempts);

    await prisma.$transaction(
      async (tx) => {
        await tx.aiJob.update({
          where: { id: jobId },
          data: {
            status: AiJobStatus.QUEUED,
            availableAt: schedule.availableAt,
            lastError: error.message,
            errorCode: error.code,
            lockedAt: null,
            lockedBy: null,
            lastHeartbeatAt: null,
          },
        });

        await tx.aiProcessing.updateMany({
          where: { documentId: job.documentId },
          data: {
            status: AiStatus.QUEUED,
            errorMessage: `Retrying (attempt ${schedule.attempts}/${job.maxAttempts}): ${error.message}`,
          },
        });
      },
      { timeout: 10000, maxWait: 5000 },
    );
  } else {
    await prisma.$transaction(
      async (tx) => {
        await tx.aiJob.update({
          where: { id: jobId },
          data: {
            status: AiJobStatus.FAILED,
            failedAt,
            lastError: error.message,
            errorCode: error.code,
            lockedAt: null,
            lockedBy: null,
            lastHeartbeatAt: null,
          },
        });

        await tx.aiProcessing.updateMany({
          where: { documentId: job.documentId },
          data: {
            status: AiStatus.FAILED,
            errorMessage: error.message,
          },
        });
      },
      { timeout: 10000, maxWait: 5000 },
    );
  }
}

export async function heartbeatJob(jobId: string, workerId: string): Promise<boolean> {
  const result = await prisma.aiJob.updateMany({
    where: {
      id: jobId,
      status: AiJobStatus.PROCESSING,
      lockedBy: workerId,
    },
    data: {
      lastHeartbeatAt: new Date(),
    },
  });

  return result.count > 0;
}

import { prisma } from "@/lib/prisma";
import { AiJobStatus, AiStatus } from "@prisma/client";
import { AI_PROCESSING_TIMEOUT_MS } from "./config";

export interface RecoveryResult {
  recovered: number;
  requeued: number;
  failed: number;
}

export async function recoverStaleAiJobs(): Promise<RecoveryResult> {
  const cutoff = new Date(Date.now() - AI_PROCESSING_TIMEOUT_MS);

  const staleJobs = await prisma.aiJob.findMany({
    where: {
      status: AiJobStatus.PROCESSING,
      lastHeartbeatAt: { lt: cutoff },
    },
    include: { document: true },
  });

  let recovered = 0;
  let requeued = 0;
  let failed = 0;

  for (const job of staleJobs) {
    try {
      if (job.attempts >= job.maxAttempts) {
        await prisma.$transaction(async (tx) => {
          await tx.aiJob.update({
            where: { id: job.id },
            data: {
              status: AiJobStatus.FAILED,
              failedAt: new Date(),
              lastError: "Job timed out after maximum attempts.",
              errorCode: "TIMEOUT",
              lockedAt: null,
              lockedBy: null,
              lastHeartbeatAt: null,
            },
          });

          await tx.aiProcessing.updateMany({
            where: { documentId: job.documentId },
            data: {
              status: AiStatus.FAILED,
              errorMessage: "AI processing timed out after maximum attempts.",
            },
          });
        });

        failed++;
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.aiJob.update({
            where: { id: job.id },
            data: {
              status: AiJobStatus.QUEUED,
              availableAt: new Date(),
              lockedAt: null,
              lockedBy: null,
              lastHeartbeatAt: null,
              lastError: "Recovered from stale processing state.",
              errorCode: "TIMEOUT",
            },
          });

          await tx.aiProcessing.updateMany({
            where: { documentId: job.documentId },
            data: {
              status: AiStatus.QUEUED,
              errorMessage: "Recovered from stale processing state.",
            },
          });
        });

        requeued++;
      }

      recovered++;
    } catch (err) {
      console.error(`Failed to recover stale job ${job.id}:`, err);
    }
  }

  return { recovered, requeued, failed };
}

export async function getStaleJobCount(): Promise<number> {
  const cutoff = new Date(Date.now() - AI_PROCESSING_TIMEOUT_MS);

  return prisma.aiJob.count({
    where: {
      status: AiJobStatus.PROCESSING,
      lastHeartbeatAt: { lt: cutoff },
    },
  });
}

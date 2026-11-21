import { prisma } from "@/lib/prisma";
import { AiJobStatus } from "@prisma/client";
import { claimNextAiJob, heartbeatJob, markJobCompleted, markJobFailed } from "./job-service";
import { runAiProcessingPipeline } from "./processor";
import { recoverStaleAiJobs } from "./recovery";
import {
  AI_PROCESSING_TIMEOUT_MS,
  AI_WORKER_CONCURRENCY,
  AI_MIN_REQUEST_GAP_MS,
  AI_WORKER_POLL_INTERVAL_MS,
  getWorkerId,
} from "./config";

class StartupMutex {
  private locked = false;

  tryLock(): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  unlock(): void {
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }
}

const workerStartupMutex = new StartupMutex();

let isRunning = false;
let activeJobs = 0;
let lastCompletedAt = 0;

export function resetWorkerState(): void {
  isRunning = false;
  activeJobs = 0;
  lastCompletedAt = 0;
  workerStartupMutex.unlock();
}

export async function getActiveJobCount(workerId?: string): Promise<number> {
  try {
    const count = await prisma.aiJob.count({
      where: {
        status: AiJobStatus.PROCESSING,
        ...(workerId ? { lockedBy: workerId } : {}),
      },
    });
    return count;
  } catch (err) {
    console.warn("[worker] Failed to query active jobs from database, using memory counter:", err);
    return activeJobs;
  }
}

export async function waitForActiveJobs(timeoutMs: number = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await getActiveJobCount();
    if (count === 0 && activeJobs === 0) break;
    await sleep(250);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processNextAiJob(
  skipGap: boolean = false,
): Promise<{ processed: boolean; jobId: string | null }> {
  const workerId = getWorkerId();
  console.log(`[worker] Attempting to claim next job (workerId=${workerId})`);
  const job = await claimNextAiJob(workerId);

  if (!job) {
    console.log(`[worker] No jobs available to claim`);
    return { processed: false, jobId: null };
  }

  console.log(
    `[worker] Claimed job ${job.id} for document ${job.documentId} (attempt ${job.attempts + 1})`,
  );
  activeJobs++;

  try {
    const document = await prisma.document.findUnique({
      where: { id: job.documentId },
      select: {
        id: true,
        name: true,
        mimeType: true,
        storageProvider: true,
        storageFileId: true,
        folderId: true,
        ownerId: true,
      },
    });

    if (!document) {
      await markJobFailed(job.id, { code: "INVALID_FILE", message: "Document not found." });
      return { processed: true, jobId: job.id };
    }

    let heartbeatInterval: NodeJS.Timeout | undefined;
    try {
      heartbeatInterval = setInterval(
        async () => {
          try {
            await heartbeatJob(job.id, workerId);
          } catch (heartbeatError) {
            console.error(`[worker] Heartbeat failed for job ${job.id}:`, heartbeatError);
          }
        },
        Math.floor(AI_PROCESSING_TIMEOUT_MS / 4),
      );

      const result = await runAiProcessingPipeline({
        documentId: document.id,
        ownerId: document.ownerId,
        mimeType: document.mimeType,
        fileName: document.name,
        storageProvider: document.storageProvider,
        storageFileId: document.storageFileId || "",
        folderId: document.folderId,
      });

      await markJobCompleted(job.id, result);
      console.log(`[worker] Completed job ${job.id}`);
    } finally {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    }

    const now = Date.now();
    if (!skipGap) {
      const timeSinceLastCompletion = now - lastCompletedAt;
      if (timeSinceLastCompletion < AI_MIN_REQUEST_GAP_MS) {
        await sleep(AI_MIN_REQUEST_GAP_MS - timeSinceLastCompletion);
      }
    }
    lastCompletedAt = Date.now();

    return { processed: true, jobId: job.id };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    console.error(`[worker] AI processing error for job ${job.id}:`, err);
    await markJobFailed(job.id, {
      code: e?.code || "UNKNOWN",
      message: e?.message || "AI processing failed.",
    });
    console.log(`[worker] Marked job ${job.id} as failed`);
    return { processed: true, jobId: job.id };
  } finally {
    activeJobs--;
  }
}

export async function processAiBatch(
  batchSize: number,
): Promise<{ processed: number; jobIds: string[] }> {
  const workerId = getWorkerId();
  console.log(
    `[worker] Starting batch processing (batchSize=${batchSize}, concurrency=${AI_WORKER_CONCURRENCY}, workerId=${workerId})`,
  );
  const jobIds: string[] = [];
  let processed = 0;

  for (let i = 0; i < batchSize; i++) {
    const dbActive = await getActiveJobCount(workerId);
    if (activeJobs >= AI_WORKER_CONCURRENCY || dbActive >= AI_WORKER_CONCURRENCY) {
      break;
    }

    const result = await processNextAiJob(true);
    if (result.processed) {
      processed++;
      if (result.jobId) jobIds.push(result.jobId);
    } else {
      break;
    }
  }

  console.log(
    `[worker] Batch processing complete (processed=${processed}, jobIds=${JSON.stringify(jobIds)})`,
  );
  return { processed, jobIds };
}

export async function runAiWorker(once = false): Promise<void> {
  if (!workerStartupMutex.tryLock()) {
    console.log("[worker] AI worker is already starting or running; ignoring call.");
    return;
  }
  isRunning = true;

  try {
    await recoverStaleAiJobs();

    const batchSize = parseInt(process.env.AI_WORKER_BATCH_SIZE || "2", 10);
    const batchInterval = parseInt(process.env.AI_WORKER_BATCH_INTERVAL_MS || "180000", 10);

    if (once) {
      await processAiBatch(batchSize);
      return;
    }

    while (isRunning) {
      const result = await processAiBatch(batchSize);

      if (result.processed === 0) {
        await sleep(AI_WORKER_POLL_INTERVAL_MS);
      } else {
        await sleep(batchInterval);
      }
    }
  } finally {
    isRunning = false;
    workerStartupMutex.unlock();
  }
}

export function stopAiWorker(): void {
  isRunning = false;
}

export async function getWorkerStats() {
  const [statusGroups, retrying, oldestQueued, completedJobs] = await Promise.all([
    prisma.aiJob.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.aiJob.count({ where: { status: AiJobStatus.QUEUED, attempts: { gt: 0 } } }),
    prisma.aiJob.findFirst({
      where: { status: AiJobStatus.QUEUED },
      orderBy: { availableAt: "asc" },
      select: { availableAt: true },
    }),
    prisma.aiJob.findMany({
      where: {
        status: AiJobStatus.COMPLETED,
        startedAt: { not: null },
        completedAt: { not: null },
      },
      select: { startedAt: true, completedAt: true },
      take: 100,
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const group of statusGroups) {
    counts[group.status] = group._count.id;
  }
  const queued = counts[AiJobStatus.QUEUED] || 0;
  const processing = counts[AiJobStatus.PROCESSING] || 0;
  const failed = counts[AiJobStatus.FAILED] || 0;
  const totalCompleted = counts[AiJobStatus.COMPLETED] || 0;

  let avgSeconds = 0;
  if (completedJobs.length > 0) {
    const totalMs = completedJobs.reduce((sum, job) => {
      if (job.startedAt && job.completedAt) {
        return sum + (job.completedAt.getTime() - job.startedAt.getTime());
      }
      return sum;
    }, 0);
    avgSeconds = Math.round(totalMs / completedJobs.length / 1000);
  }

  const successRate = totalCompleted + failed > 0 ? totalCompleted / (totalCompleted + failed) : 0;

  return {
    queued,
    processing,
    failed,
    retrying,
    oldestQueuedAt: oldestQueued?.availableAt || null,
    avgProcessingTimeSeconds: avgSeconds,
    successRate,
  };
}

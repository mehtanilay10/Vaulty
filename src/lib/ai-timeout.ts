import { prisma } from "@/lib/prisma";
import { AI_PROCESSING_TIMEOUT_MS } from "@/lib/ai/config";
import { AiJobStatus } from "@prisma/client";

export async function timeoutStaleAiProcessing(userId: string) {
  const cutoff = new Date(Date.now() - AI_PROCESSING_TIMEOUT_MS);

  const staleProcessingRecords = await prisma.aiProcessing.findMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: cutoff },
      document: { ownerId: userId },
    },
    select: { id: true, documentId: true },
  });

  if (staleProcessingRecords.length === 0) return;

  const documentIds = staleProcessingRecords.map((r) => r.documentId);

  const activeJobs = await prisma.aiJob.findMany({
    where: {
      documentId: { in: documentIds },
      status: { in: [AiJobStatus.QUEUED, AiJobStatus.PROCESSING] },
      lastHeartbeatAt: { gt: cutoff },
    },
    select: { documentId: true },
  });

  const activeDocumentIds = new Set(activeJobs.map((j) => j.documentId));
  const toFail = staleProcessingRecords.filter((r) => !activeDocumentIds.has(r.documentId));

  if (toFail.length === 0) return;

  const ids = toFail.map((r) => r.id);
  await prisma.aiProcessing.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "FAILED",
      errorMessage: "AI processing timed out due to no response.",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureAiJobsAndProcessing } from "@/lib/ai/job-service";
import { GEMINI_MODEL } from "@/lib/gemini";
import { timeoutStaleAiProcessing } from "@/lib/ai-timeout";
import { AiJobStatus, AiStatus } from "@prisma/client";
import { z } from "zod";
import { validateCSRFRequest } from "@/lib/csrf";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

export async function POST(req: NextRequest) {
  try {
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.documentsAiBatch,
    });
    if (rateLimited) return rateLimited;

    await timeoutStaleAiProcessing(user.id);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid bulk AI request." }, { status: 400 });
    }

    const parsed = z
      .object({
        status: z.enum(["ALL", "FAILED", "PENDING"]).optional(),
        documentIds: z.array(z.string().min(1).max(128)).max(100).optional(),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid bulk AI request." }, { status: 400 });
    const { status, documentIds } = parsed.data;

    let targetStatuses: AiStatus[];
    if (status === "ALL") {
      targetStatuses = [];
    } else if (status === "FAILED") {
      targetStatuses = [AiStatus.FAILED];
    } else if (status === "PENDING") {
      targetStatuses = [AiStatus.QUEUED, AiStatus.PROCESSING];
    } else {
      targetStatuses = [AiStatus.QUEUED, AiStatus.PROCESSING, AiStatus.FAILED];
    }

    let documents;
    if (documentIds) {
      documents = await prisma.document.findMany({
        where: { ownerId: user.id, id: { in: documentIds } },
        select: {
          id: true,
          aiProcessing: { select: { status: true } },
          aiJobs: { select: { status: true } },
        },
      });
    } else {
      documents = await prisma.document.findMany({
        where: {
          ownerId: user.id,
          ...(targetStatuses.length > 0
            ? { aiProcessing: { status: { in: targetStatuses } } }
            : {}),
        },
        select: {
          id: true,
          aiProcessing: { select: { status: true } },
          aiJobs: { select: { status: true } },
        },
      });
    }

    const results = {
      queued: 0,
      alreadyQueued: 0,
      alreadyProcessing: 0,
      skipped: 0,
    };
    const toQueue: string[] = [];

    for (const doc of documents) {
      const activeJob = doc.aiJobs?.find(
        (j) => j.status === AiJobStatus.QUEUED || j.status === AiJobStatus.PROCESSING,
      );

      if (activeJob) {
        if (activeJob.status === AiJobStatus.QUEUED) {
          results.alreadyQueued++;
        } else if (activeJob.status === AiJobStatus.PROCESSING) {
          results.alreadyProcessing++;
        }
        continue;
      }

      if (status !== "ALL" && doc.aiProcessing?.status === "COMPLETED") {
        results.skipped++;
        continue;
      }

      toQueue.push(doc.id);
    }

    if (toQueue.length > 0) {
      const { queuedDocumentIds, activeJobs } = await ensureAiJobsAndProcessing(
        toQueue,
        GEMINI_MODEL,
      );
      results.queued = queuedDocumentIds.length;

      // Jobs created by concurrent requests between the read above and the
      // queue transaction are reported as already queued/processing.
      const activeByDocument = new Map<string, AiJobStatus>();
      for (const job of activeJobs) {
        if (!activeByDocument.has(job.documentId)) {
          activeByDocument.set(job.documentId, job.status);
        }
      }

      for (const jobStatus of activeByDocument.values()) {
        if (jobStatus === AiJobStatus.QUEUED) {
          results.alreadyQueued++;
        } else if (jobStatus === AiJobStatus.PROCESSING) {
          results.alreadyProcessing++;
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("POST /api/documents/ai/batch error:", error);
    return NextResponse.json({ error: "Failed to batch process AI." }, { status: 500 });
  }
}

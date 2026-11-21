import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { isConfiguredAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { AiJobStatus } from "@prisma/client";
import { z } from "zod";
import { validateCSRFRequest } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isConfiguredAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });

    const parsed = z
      .object({
        documentId: z.string().min(1).max(128).optional(),
        status: z.enum(["NOT_REQUESTED", "QUEUED", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
      })
      .strict()
      .safeParse(await req.json().catch(() => ({})));
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid cleanup request." }, { status: 400 });
    const { documentId, status } = parsed.data;

    const processingWhere: Record<string, unknown> = {
      document: { ownerId: user.id },
    };

    if (documentId) {
      processingWhere.documentId = documentId;
    }

    if (status) {
      processingWhere.status = status;
    }

    const processingResult = await prisma.aiProcessing.updateMany({
      where: processingWhere as never,
      data: {
        status: "NOT_REQUESTED",
        extractedText: null,
        summaryMarkdown: null,
        interpretationMarkdown: null,
        errorMessage: null,
        processedAt: null,
        modelUsed: null,
      },
    });

    const jobWhere: Record<string, unknown> = {
      document: { ownerId: user.id },
    };

    if (documentId) {
      jobWhere.documentId = documentId;
    }

    const jobResult = await prisma.aiJob.updateMany({
      where: {
        ...jobWhere,
        status: { in: [AiJobStatus.QUEUED, AiJobStatus.PROCESSING, AiJobStatus.FAILED] },
      } as never,
      data: {
        status: AiJobStatus.CANCELLED,
        lockedAt: null,
        lockedBy: null,
        lastHeartbeatAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      processingCount: processingResult.count,
      jobCount: jobResult.count,
      message: `Reset ${processingResult.count} AI processing record(s) and cancelled ${jobResult.count} job(s).`,
    });
  } catch (error) {
    console.error("POST /api/admin/cleanup-ai error:", error);
    return NextResponse.json({ error: "Failed to cleanup AI processing data." }, { status: 500 });
  }
}

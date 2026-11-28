import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess } from "@/lib/authz";
import { ensureAiJobAndProcessing } from "@/lib/ai/job-service";
import { GEMINI_MODEL } from "@/lib/gemini";
import { timeoutStaleAiProcessing } from "@/lib/ai-timeout";
import { validateCSRFRequest } from "@/lib/csrf";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.documentsAi,
    });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const access = await checkDocumentAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the document owner can trigger or retry AI processing." },
        { status: 403 },
      );
    }

    await timeoutStaleAiProcessing(user.id);

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        mimeType: true,
        storageProvider: true,
        storageFileId: true,
        folderId: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const { job, aiProcessing } = await ensureAiJobAndProcessing(document.id, GEMINI_MODEL);

    return NextResponse.json({
      message: "AI processing job created.",
      jobId: job.id,
      status: job.status,
      aiProcessingStatus: aiProcessing.status,
    });
  } catch (error) {
    console.error("POST /api/documents/[id]/ai error:", error);
    return NextResponse.json(
      { error: "An error occurred while creating AI job." },
      { status: 500 },
    );
  }
}

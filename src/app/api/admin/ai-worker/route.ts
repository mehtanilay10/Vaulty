import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { isConfiguredAdmin } from "@/lib/admin-auth";
import { z } from "zod";
import { validateCSRFRequest } from "@/lib/csrf";
import { stopAiWorker, getWorkerStats, recoverStaleAiJobs, processAiBatch } from "@/lib/ai";

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
      .object({ action: z.enum(["stop", "recover", "process", "stats"]) })
      .strict()
      .safeParse(await req.json().catch(() => ({})));
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Invalid or missing worker action. Action must be one of: stop, recover, process, stats.",
        },
        { status: 400 },
      );
    const { action } = parsed.data;

    if (action === "stop") {
      stopAiWorker();
      return NextResponse.json({ message: "Worker stop signal sent." });
    }

    if (action === "recover") {
      const result = await recoverStaleAiJobs();
      return NextResponse.json({ message: "Recovery completed.", result });
    }

    if (action === "process") {
      const batchSize = parseInt(process.env.AI_WORKER_BATCH_SIZE || "2", 10);
      const result = await processAiBatch(batchSize);
      return NextResponse.json({ message: "Batch processed.", result });
    }

    const stats = await getWorkerStats();
    return NextResponse.json({ message: "Worker stats retrieved.", stats });
  } catch (error) {
    console.error("POST /api/admin/ai-worker error:", error);
    return NextResponse.json({ error: "Failed to interact with AI worker." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isConfiguredAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stats = await getWorkerStats();
    return NextResponse.json({ stats });
  } catch (error) {
    console.error("GET /api/admin/ai-worker error:", error);
    return NextResponse.json({ error: "Failed to fetch worker stats." }, { status: 500 });
  }
}

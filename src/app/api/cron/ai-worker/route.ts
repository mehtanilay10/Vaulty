import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processAiBatch, getWorkerStats } from "@/lib/ai/worker";
import { z } from "zod";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.trim().length === 0) {
    console.error(
      "[cron/ai-worker] Authorization failed: CRON_SECRET is not configured or is empty.",
    );
    return false;
  }
  if (expected.length < 32) {
    console.error(
      "[cron/ai-worker] Authorization failed: CRON_SECRET is shorter than the required 32 characters.",
    );
    return false;
  }
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    console.warn(
      "[cron/ai-worker] Authorization failed: Missing or invalid Bearer authorization header.",
    );
    return false;
  }
  const actual = header.slice(7);
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  const isValid = a.length === b.length && timingSafeEqual(a, b);
  if (!isValid) {
    console.warn(
      "[cron/ai-worker] Authorization failed: Provided Bearer token does not match CRON_SECRET.",
    );
  }
  return isValid;
}

async function run(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const parsed = z
      .object({ batchSize: z.coerce.number().int().min(1).max(10).optional() })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid worker batch size." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    const configured = Number.parseInt(process.env.AI_WORKER_BATCH_SIZE || "2", 10);
    const batchSize = parsed.data.batchSize ?? Math.min(10, Math.max(1, configured || 2));
    const result = await processAiBatch(batchSize);
    const stats = await getWorkerStats();
    return NextResponse.json(
      { message: "AI worker batch processed.", result, stats },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[cron] AI worker failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Failed to process AI worker batch." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncAllEmailConnections } from "@/lib/sync/email-sync-engine";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.trim().length === 0) {
    console.error(
      "[cron/email-sync] Authorization failed: CRON_SECRET is not configured or is empty.",
    );
    return false;
  }
  if (expected.length < 32) {
    console.error(
      "[cron/email-sync] Authorization failed: CRON_SECRET is shorter than the required 32 characters.",
    );
    return false;
  }
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    console.warn(
      "[cron/email-sync] Authorization failed: Missing or invalid Bearer authorization header.",
    );
    return false;
  }
  const actual = header.slice(7);
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // In serverless cron, bound maxPages to 3 to finish within timeout budget
    const result = await syncAllEmailConnections({
      maxPages: 3,
      autoImportThreshold: 0.9,
    });

    const totalAutoImported = result.results.reduce(
      (acc, r) => acc + r.transactionsAutoImported,
      0,
    );
    const totalPending = result.results.reduce((acc, r) => acc + r.transactionsPendingReview, 0);
    const totalDocuments = result.results.reduce((acc, r) => acc + (r.documentsDiscovered || 0), 0);
    const totalRemindersAuto = result.results.reduce(
      (acc, r) => acc + (r.remindersAutoImported || 0),
      0,
    );
    const totalRemindersPending = result.results.reduce(
      (acc, r) => acc + (r.remindersPendingReview || 0),
      0,
    );

    return NextResponse.json(
      {
        message: "Email multi-module sync processed successfully.",
        summary: {
          usersProcessed: result.usersProcessed,
          transactionsAutoImported: totalAutoImported,
          transactionsPendingReview: totalPending,
          documentsDiscovered: totalDocuments,
          remindersAutoImported: totalRemindersAuto,
          remindersPendingReview: totalRemindersPending,
          durationMs: result.completedAt.getTime() - result.startedAt.getTime(),
          errors: result.errors,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[cron/email-sync] Email sync failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Failed to process email sync." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

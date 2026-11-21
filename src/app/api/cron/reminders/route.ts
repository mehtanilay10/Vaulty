import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processReminderNotifications } from "@/lib/reminder-worker";

function isAuthorized(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || "";
  if (!expected || expected.length < 32 || !header.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req))
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const result = await processReminderNotifications();
    return NextResponse.json(
      { message: "Reminder notifications processed.", result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[cron] Reminder processing failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Failed to process reminders." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { NextResponse } from "next/server";
import { consumeSecurityAttempt } from "@/lib/security-rate-limit";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

/**
 * Shared across serverless instances via the SecurityRateLimit table.
 * Replaces the previous in-memory Map, which reset per instance and grew
 * unboundedly.
 */
export async function rateLimit(key: string): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}> {
  return consumeSecurityAttempt({
    key,
    limit: RATE_LIMIT_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
}

export function createRateLimitResponse(retryAfterSeconds?: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      ...(retryAfterSeconds ? { headers: { "Retry-After": String(retryAfterSeconds) } } : {}),
    },
  );
}

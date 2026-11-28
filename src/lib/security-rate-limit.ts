import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds?: number };

/**
 * Rate-limit keys are always constructed from trusted prefixes plus hex/cuid
 * identifiers. Reject anything else before it reaches the raw SQL statement so
 * unexpected input can never be used to shape the query.
 */
const SECURITY_KEY_PATTERN = /^[A-Za-z0-9:_-]{1,200}$/;

function isValidSecurityKey(key: string): boolean {
  return typeof key === "string" && SECURITY_KEY_PATTERN.test(key);
}

/** Atomic PostgreSQL-backed limiter, shared across serverless instances. */
export async function consumeSecurityAttempt(input: {
  key: string;
  limit: number;
  windowMs: number;
  blockMs?: number;
}): Promise<RateLimitResult> {
  if (!isValidSecurityKey(input.key)) {
    // Fail closed: an unexpected key must not result in an unthrottled request.
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(Math.min(input.windowMs, 60_000) / 1000)),
    };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - input.windowMs);
  const blockMs = input.blockMs ?? input.windowMs;
  const rows = await prisma.$queryRaw<Array<{ attempts: number; blockedUntil: Date | null }>>`
    INSERT INTO "SecurityRateLimit" ("key", "attempts", "windowStartedAt", "updatedAt")
    VALUES (${input.key}, 1, ${now}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "SecurityRateLimit"."windowStartedAt" < ${windowStart} THEN 1 ELSE "SecurityRateLimit"."attempts" + 1 END,
      "windowStartedAt" = CASE WHEN "SecurityRateLimit"."windowStartedAt" < ${windowStart} THEN ${now} ELSE "SecurityRateLimit"."windowStartedAt" END,
      "blockedUntil" = CASE WHEN "SecurityRateLimit"."blockedUntil" > ${now} THEN "SecurityRateLimit"."blockedUntil"
        WHEN (CASE WHEN "SecurityRateLimit"."windowStartedAt" < ${windowStart} THEN 1 ELSE "SecurityRateLimit"."attempts" + 1 END) >= ${input.limit} THEN ${new Date(now.getTime() + blockMs)} ELSE NULL END,
      "updatedAt" = ${now}
    RETURNING "attempts", "blockedUntil"
  `;
  const row = rows[0];
  if (row.blockedUntil && row.blockedUntil > now)
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000),
      ),
    };
  return {
    allowed: row.attempts <= input.limit,
    remaining: Math.max(0, input.limit - row.attempts),
  };
}

export async function clearSecurityAttempts(key: string): Promise<void> {
  if (!isValidSecurityKey(key)) return;
  await prisma.securityRateLimit.deleteMany({ where: { key } });
}

/**
 * Convenience wrapper for authenticated routes: consumes one attempt for the
 * user+scope and returns a 429 NextResponse when over the limit, or null when
 * the request may proceed.
 */
export async function userRateLimitResponse(input: {
  userId: string;
  scope: string;
  limit: number;
  windowMs?: number;
}): Promise<NextResponse | null> {
  const result = await consumeSecurityAttempt({
    key: `rl:${input.scope}:${input.userId}`,
    limit: input.limit,
    windowMs: input.windowMs ?? 60_000,
  });
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds ?? 60) },
    },
  );
}

/**
 * CSRF protection using a signed double-submit cookie.
 * Tokens are HMAC-SHA256 signed and expire after one hour.
 */

import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_TOKEN_TTL_MS,
  MIN_SECRET_LENGTH,
} from "@/lib/constants";

function getCsrfSecret(): string {
  const dedicatedSecret = process.env.CSRF_SECRET;
  if (dedicatedSecret && dedicatedSecret.length >= MIN_SECRET_LENGTH) {
    return dedicatedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `CSRF_SECRET must be configured in production and contain at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }

  // Development may reuse AUTH_SECRET, but there is deliberately no hardcoded
  // fallback: a missing/weak secret must fail loudly in every environment.
  const developmentSecret = process.env.AUTH_SECRET;
  if (developmentSecret && developmentSecret.length >= MIN_SECRET_LENGTH) {
    return developmentSecret;
  }

  throw new Error(
    `CSRF_SECRET (or AUTH_SECRET in development) must be configured with at least ${MIN_SECRET_LENGTH} characters.`,
  );
}

function sign(data: string): string {
  return createHmac("sha256", getCsrfSecret()).update(data, "utf8").digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/** Generate an HMAC-signed CSRF token. */
export function generateCSRFToken(): string {
  const nonce = randomBytes(32).toString("hex");
  const timestamp = Date.now().toString();
  const data = `${nonce}:${timestamp}`;
  return `${data}:${sign(data)}`;
}

/** Verify signature, token format and one-hour validity window. */
export function verifyCSRFToken(token: string): boolean {
  try {
    if (typeof token !== "string" || token.length > 256) return false;
    const parts = token.split(":");
    if (parts.length !== 3) return false;

    const [nonce, timestampText, signature] = parts;
    if (!/^[a-f0-9]{64}$/i.test(nonce) || !/^\d{13}$/.test(timestampText)) return false;
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

    const timestamp = Number(timestampText);
    const age = Date.now() - timestamp;
    if (!Number.isSafeInteger(timestamp) || age < 0 || age > CSRF_TOKEN_TTL_MS) return false;

    return safeEqualHex(signature, sign(`${nonce}:${timestampText}`));
  } catch {
    return false;
  }
}

/** Read or create the CSRF cookie for the current response. */
export async function getCSRFToken(): Promise<string> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(CSRF_COOKIE_NAME);

  if (existingToken && verifyCSRFToken(existingToken.value)) return existingToken.value;

  const newToken = generateCSRFToken();
  cookieStore.set(CSRF_COOKIE_NAME, newToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  return newToken;
}

/** Validate the signed request header and bind it to the CSRF cookie. */
export function validateCSRFRequest(request: Request): boolean {
  const token = request.headers.get(CSRF_HEADER_NAME);
  if (!token || !verifyCSRFToken(token)) return false;

  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  if (!cookieMatch) return false;

  try {
    const rawValue = cookieMatch[1];
    if (/%(?![0-9a-fA-F]{2})/.test(rawValue)) {
      return false;
    }
    const cookieToken = decodeURIComponent(rawValue);
    if (!verifyCSRFToken(cookieToken)) return false;
    return safeEqualText(cookieToken, token);
  } catch {
    return false;
  }
}

/** Client-side helper retained for existing server-side imports. */
export function readCSRFTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  if (!match) return null;
  try {
    const rawValue = match[1];
    if (/%(?![0-9a-fA-F]{2})/.test(rawValue)) {
      return null;
    }
    const decoded = decodeURIComponent(rawValue);
    return verifyCSRFToken(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export { CSRF_HEADER_NAME, CSRF_COOKIE_NAME };

/** Validate that the request comes from an allowed origin to prevent CSRF from external sites. */
export function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // In production, require at least one of these headers
  if (process.env.NODE_ENV === "production" && !origin && !referer) {
    return false;
  }

  const allowedOrigins = [
    process.env.NEXTAUTH_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    // Only include localhost in non-production environments
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined,
  ].filter(Boolean) as string[];

  const isOriginAllowed = (urlCandidate: string): boolean => {
    try {
      const parsed = new URL(urlCandidate);
      return allowedOrigins.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed);
          return parsed.origin === allowedUrl.origin;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  };

  // If origin is present, validate it
  if (origin) {
    return isOriginAllowed(origin);
  }

  // If referer is present (and no origin), validate it
  if (referer) {
    return isOriginAllowed(referer);
  }

  return true;
}

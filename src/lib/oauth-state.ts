import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function getStateSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters to secure OAuth state.");
  }
  return secret;
}

/**
 * Creates an HMAC-signed OAuth state string with expiry and cryptographic nonce.
 */
export function createOAuthState(userId: string, ttlMs = 10 * 60 * 1000): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt, nonce: randomBytes(16).toString("hex") }),
  ).toString("base64url");
  const signature = createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verifies the HMAC signature, timestamp, and extracts userId from the OAuth state.
 */
export function verifyOAuthState(state: string | null): string | null {
  if (!state) return null;
  const [payload, suppliedSignature, extra] = state.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expected = createHmac("sha256", getStateSecret()).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: string;
      expiresAt?: number;
    };
    if (!decoded.userId || !decoded.expiresAt || decoded.expiresAt < Date.now()) return null;
    return decoded.userId;
  } catch {
    return null;
  }
}

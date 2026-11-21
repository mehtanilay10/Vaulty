import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { MIN_SHARE_PASSWORD_LENGTH, MAX_SHARE_PASSWORD_LENGTH } from "@/lib/constants";

export { MIN_SHARE_PASSWORD_LENGTH, MAX_SHARE_PASSWORD_LENGTH } from "@/lib/constants";

const PREFIX = "scrypt:";

function getShareSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.CSRF_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET or CSRF_SECRET must be configured with at least 32 characters in production.",
    );
  }
  return "development-only-fallback-share-secret-32-chars";
}

export function getShareAuthCookieName(token: string): string {
  return `share_auth_${token}`;
}

export function createShareAuthToken(token: string, maxAgeMs = 30 * 60 * 1000): string {
  const expiresAt = Date.now() + maxAgeMs;
  const payload = `${token}:${expiresAt}`;
  const sig = createHmac("sha256", getShareSecret()).update(payload).digest("hex");
  return `${expiresAt}.${sig}`;
}

export function verifyShareAuthToken(
  token: string,
  cookieValue: string | undefined | null,
): boolean {
  if (!cookieValue || typeof cookieValue !== "string") return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return false;
  const [expiresAtStr, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const payload = `${token}:${expiresAtStr}`;
  const expectedSig = createHmac("sha256", getShareSecret()).update(payload).digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Validates share password strength (not empty, min 8 chars, max 128 chars)
 */
export function validateSharePassword(password: string): { isValid: boolean; error?: string } {
  if (typeof password !== "string" || !password.trim()) {
    return { isValid: false, error: "Share password cannot be empty." };
  }
  if (password.length < MIN_SHARE_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Share password must be at least ${MIN_SHARE_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password.length > MAX_SHARE_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: `Share password cannot exceed ${MAX_SHARE_PASSWORD_LENGTH} characters.`,
    };
  }
  return { isValid: true };
}

export function hashSharePassword(password: string): string {
  const validation = validateSharePassword(password);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64, { maxmem: 128 * 1024 * 1024 }).toString("base64");
  return `${PREFIX}${salt}:${hash}`;
}

export function verifySharePassword(password: string, stored: string | null): boolean {
  if (!password || !stored || typeof password !== "string") return false;

  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, salt, expectedHash] = parts;
  if (!salt || !expectedHash) return false;
  const actualHash = scryptSync(password, salt, 64, { maxmem: 128 * 1024 * 1024 }).toString(
    "base64",
  );
  const expectedBuf = Buffer.from(expectedHash, "base64");
  const actualBuf = Buffer.from(actualHash, "base64");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

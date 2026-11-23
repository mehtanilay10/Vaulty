/**
 * Zero-dependency RFC 6238 TOTP (Time-Based One-Time Password) implementation
 * using standard Web Crypto API (HMAC-SHA1).
 */

export interface ParsedOtpAuthUri {
  type: string;
  secret: string;
  issuer?: string;
  account?: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}

export interface TOTPOptions {
  digits?: number;
  stepSeconds?: number;
}

/**
 * Decodes an RFC 4648 Base32 encoded string into a Uint8Array.
 * Case-insensitive, ignores whitespace, hyphens, and padding ('=').
 */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s\-_=]/g, "");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Parses an otpauth://totp/... (or otpauth://hotp/...) URI.
 * Extracts the secret, issuer, account, algorithm, digits, and period.
 */
export function parseOtpAuthUri(uri: string): ParsedOtpAuthUri | null {
  try {
    const trimmed = uri.trim();
    if (!trimmed.toLowerCase().startsWith("otpauth://")) {
      return null;
    }

    const url = new URL(trimmed);
    const type = url.host.toLowerCase();

    // The pathname contains the label (e.g. /Example:alice@google.com or /alice@google.com)
    const rawLabel = decodeURIComponent(url.pathname.replace(/^\//, ""));
    let issuer: string | undefined = undefined;
    let account: string | undefined = undefined;

    if (rawLabel.includes(":")) {
      const parts = rawLabel.split(":");
      issuer = parts[0].trim();
      account = parts.slice(1).join(":").trim();
    } else if (rawLabel.trim()) {
      account = rawLabel.trim();
    }

    const queryIssuer = url.searchParams.get("issuer");
    if (queryIssuer) {
      issuer = queryIssuer.trim();
    }

    const secret = url.searchParams.get("secret");
    if (!secret) {
      return null;
    }

    const algorithm = (url.searchParams.get("algorithm") || "SHA1").toUpperCase();
    const digitsStr = url.searchParams.get("digits");
    const digits = digitsStr ? parseInt(digitsStr, 10) : 6;
    const periodStr = url.searchParams.get("period");
    const period = periodStr ? parseInt(periodStr, 10) : 30;

    return {
      type,
      secret: secret.trim(),
      issuer,
      account,
      algorithm,
      digits: Number.isFinite(digits) && digits > 0 ? digits : 6,
      period: Number.isFinite(period) && period > 0 ? period : 30,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the number of seconds remaining until the current TOTP step rolls over.
 * Default step is 30 seconds.
 */
export function getTOTPRemainingSeconds(stepSeconds = 30): number {
  const now = Math.floor(Date.now() / 1000);
  const remainder = now % stepSeconds;
  return remainder === 0 ? stepSeconds : stepSeconds - remainder;
}

/**
 * Generates an RFC 6238 TOTP code using Web Crypto (crypto.subtle HMAC-SHA1).
 * Accepts either a raw Base32 secret or a full otpauth:// URI.
 */
export async function generateTOTP(
  secret: string,
  time?: number | Date,
  options?: TOTPOptions,
): Promise<string> {
  let cleanSecret = secret.trim();
  let digits = options?.digits ?? 6;
  let stepSeconds = options?.stepSeconds ?? 30;

  if (cleanSecret.toLowerCase().startsWith("otpauth://")) {
    const parsed = parseOtpAuthUri(cleanSecret);
    if (parsed) {
      cleanSecret = parsed.secret;
      if (options?.digits === undefined && parsed.digits) {
        digits = parsed.digits;
      }
      if (options?.stepSeconds === undefined && parsed.period) {
        stepSeconds = parsed.period;
      }
    }
  }

  const keyBytes = base32Decode(cleanSecret);

  let epochSeconds: number;
  if (time instanceof Date) {
    epochSeconds = Math.floor(time.getTime() / 1000);
  } else if (typeof time === "number") {
    epochSeconds = time > 1e11 ? Math.floor(time / 1000) : Math.floor(time);
  } else {
    epochSeconds = Math.floor(Date.now() / 1000);
  }

  const counter = Math.floor(epochSeconds / stepSeconds);
  const counterBytes = new Uint8Array(8);
  let temp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }

  const cryptoObj =
    typeof globalThis !== "undefined" && globalThis.crypto ? globalThis.crypto : undefined;
  if (!cryptoObj?.subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available.");
  }

  const rawKey = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength,
  ) as ArrayBuffer;

  // Import raw key for HMAC SHA-1
  const cryptoKey = await cryptoObj.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: { name: "SHA-1" } },
    false,
    ["sign"],
  );

  const rawCounter = counterBytes.buffer.slice(
    counterBytes.byteOffset,
    counterBytes.byteOffset + counterBytes.byteLength,
  ) as ArrayBuffer;

  const signature = await cryptoObj.subtle.sign("HMAC", cryptoKey, rawCounter);
  const sigBytes = new Uint8Array(signature);

  // Dynamic truncation (RFC 4226 Section 5.4)
  const offset = sigBytes[sigBytes.length - 1] & 0x0f;
  const binary =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

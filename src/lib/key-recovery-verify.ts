/**
 * Server-side recovery answer verification.
 *
 * Kept separate from `key-recovery.ts` because that module is also imported by
 * client components and must not pull Node's crypto module into the browser
 * bundle. Hash comparisons use `timingSafeEqual` to avoid leaking match
 * information through response timing.
 */
import { timingSafeEqual } from "node:crypto";
import { CURRENT_PBKDF2_ITERATIONS, MAX_PBKDF2_ITERATIONS } from "@/lib/constants";

function constantTimeEqualHex(actual: Uint8Array, expectedHex: string): boolean {
  if (expectedHex.length % 2 !== 0 || !/^[a-f0-9]*$/i.test(expectedHex)) {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/**
 * Verify recovery answer against stored PBKDF2 hash.
 */
export async function verifyRecoveryAnswer(answer: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith("pbkdf2:")) {
    return false;
  }

  const [, roundsText, saltHex, expectedHex] = storedHash.split(":");
  if (!roundsText || !saltHex || !expectedHex) return false;

  const rounds = Number(roundsText);
  if (
    !Number.isInteger(rounds) ||
    rounds < CURRENT_PBKDF2_ITERATIONS ||
    rounds > MAX_PBKDF2_ITERATIONS ||
    !/^[a-f0-9]{32}$/i.test(saltHex) ||
    !/^[a-f0-9]{64}$/i.test(expectedHex)
  )
    return false;

  const normalized = answer.normalize("NFKC").trim().toLowerCase();
  const salt = new Uint8Array((saltHex.match(/.{2}/g) || []).map((b) => parseInt(b, 16)));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalized),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: rounds, hash: "SHA-256" },
      material,
      256,
    ),
  );
  return constantTimeEqualHex(bits, expectedHex);
}

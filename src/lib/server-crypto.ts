/**
 * Server-side crypto utilities using bcrypt
 * Used for master password hashing and verification on the server
 */

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { BCRYPT_ROUNDS, FAILED_VERIFY_MIN_DURATION_MS } from "@/lib/constants";

/**
 * Compute SHA-256 hex digest of a string or buffer.
 * Standard helper used across reset tokens, rate-limit keys, and verifiers.
 */
export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Hash a reset token using SHA-256 for secure database persistence and lookup.
 */
export function hashResetToken(token: string): string {
  return sha256Hex(token);
}

async function padFailedVerification(startedAt: number): Promise<void> {
  const remaining = FAILED_VERIFY_MIN_DURATION_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

/**
 * Hash master password using bcrypt
 */
export async function hashMasterPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify master password against stored bcrypt hash
 */
export async function verifyMasterPassword(password: string, storedHash: string): Promise<boolean> {
  const startedAt = Date.now();
  let valid = false;

  if (storedHash.startsWith("$2")) {
    try {
      valid = await bcrypt.compare(password, storedHash);
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    await padFailedVerification(startedAt);
  }

  return valid;
}

/**
 * Generate a random token for password reset
 */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a PIN using bcrypt for secure storage
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

/**
 * Verify a PIN against stored hash
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(pin, storedHash);
}

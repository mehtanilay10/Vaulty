/**
 * Encryption key recovery mechanism
 * Allows users to recover credentials if they forget their master password
 * Uses recovery questions and an offline recovery key
 */

import { CURRENT_PBKDF2_ITERATIONS } from "@/lib/kdf-config";
import { getWebCrypto } from "@/lib/web-crypto";

export interface RecoveryKey {
  keyId: string;
  encryptedKEK: string;
  salt: string;
  iv: string;
  kdfIterations: number;
  createdAt: Date;
}

export interface RecoveryQuestion {
  id: string;
  question: string;
  answerHash: string;
}

const RECOVERY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What is your favorite book?",
  "What year did you graduate high school?",
  "What is the make and model of your first car?",
  "What is the name of your childhood best friend?",
];

/**
 * Generate a recovery key for offline storage
 * Encrypts the vault KEK with a key derived from the recovery key so the user
 * can recover their encryption key if they forget their master password.
 */
export async function generateRecoveryKey(
  kek: CryptoKey,
  providedRecoveryKey?: string,
): Promise<{
  keyId: string;
  recoveryKey: string;
  encryptedKEK: string;
  salt: string;
  iv: string;
  kdfIterations: number;
}> {
  const cryptoApi = getWebCrypto();
  let keyId: string;
  if (typeof cryptoApi.randomUUID === "function") {
    keyId = cryptoApi.randomUUID();
  } else {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC4122 v4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC4122 variant
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    keyId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  const kdfIterations = CURRENT_PBKDF2_ITERATIONS;
  const recoveryKey =
    providedRecoveryKey ||
    Array.from(cryptoApi.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const salt = Array.from(cryptoApi.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const iv = Array.from(cryptoApi.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Derive a wrapping key from the recovery key + salt
  const saltBuffer = new TextEncoder().encode(salt);
  const recoveryBuffer = new TextEncoder().encode(recoveryKey);
  const keyMaterial = await cryptoApi.subtle.importKey("raw", recoveryBuffer, "PBKDF2", false, [
    "deriveKey",
  ]);
  const wrapKey = await cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: kdfIterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  // Export the KEK as JWK and wrap it with the recovery-derived key
  const kekJwk = await cryptoApi.subtle.exportKey("jwk", kek);
  const kekBuffer = new TextEncoder().encode(JSON.stringify(kekJwk));
  const ivBuffer = new Uint8Array(iv.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
  const wrapped = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv: ivBuffer },
    wrapKey,
    kekBuffer,
  );

  const encryptedKEK = arrayBufferToBase64(wrapped);

  return {
    keyId,
    recoveryKey,
    encryptedKEK,
    salt,
    iv,
    kdfIterations,
  };
}

/**
 * Hash recovery question answer
 */
export async function hashRecoveryAnswer(answer: string): Promise<string> {
  const cryptoApi = getWebCrypto();
  const normalized = answer.normalize("NFKC").trim().toLowerCase();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const material = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalized),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await cryptoApi.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: CURRENT_PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    256,
  );
  const hex = (bytes: Uint8Array) =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return `pbkdf2:${CURRENT_PBKDF2_ITERATIONS}:${hex(salt)}:${hex(new Uint8Array(bits))}`;
}

/**
 * Get available recovery questions
 */
export function getRecoveryQuestions(): string[] {
  return RECOVERY_QUESTIONS;
}

/**
 * Derive recovery key from answers
 */
export async function deriveRecoveryKey(answers: string[], salt: string): Promise<string> {
  const cryptoApi = getWebCrypto();
  const saltBuffer = new TextEncoder().encode(salt);
  const combinedAnswers = answers.join("|").toLowerCase().trim();
  const answerBuffer = new TextEncoder().encode(combinedAnswers);

  const keyMaterial = await cryptoApi.subtle.importKey("raw", answerBuffer, "PBKDF2", false, [
    "deriveKey",
  ]);

  const key = await cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: CURRENT_PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const exported = await cryptoApi.subtle.exportKey("raw", key);
  const keyArray = Array.from(new Uint8Array(exported));
  return keyArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Decrypt the vault KEK using the offline recovery key and stored recovery metadata
 */
export async function unwrapRecoveryKEK(params: {
  recoveryKey: string;
  recoverySalt: string;
  recoveryIv: string;
  recoveryEncryptedKEK: string;
  recoveryKdfIterations: number;
}): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  const saltBuffer = new TextEncoder().encode(params.recoverySalt);
  const recoveryBuffer = new TextEncoder().encode(params.recoveryKey);
  const keyMaterial = await cryptoApi.subtle.importKey("raw", recoveryBuffer, "PBKDF2", false, [
    "deriveKey",
  ]);
  const wrapKey = await cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: params.recoveryKdfIterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );

  const ivBuffer = new Uint8Array(params.recoveryIv.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  const encryptedBuffer = base64ToArrayBuffer(params.recoveryEncryptedKEK);
  const decrypted = await cryptoApi.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    wrapKey,
    encryptedBuffer,
  );

  const kekJwk = JSON.parse(new TextDecoder().decode(decrypted));
  return cryptoApi.subtle.importKey("jwk", kekJwk, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Key-wrapping utilities for app-lock convenience unlock.
 *
 * The vault encryption key may be wrapped with a local PIN-derived secret for
 * convenience unlock. Master-password-derived secrets are never persisted.
 * The wrapped key is device-local convenience data, not a substitute for the
 * master password or server-side authentication.
 */

import {
  CURRENT_PBKDF2_ITERATIONS,
  AES_GCM_ALGORITHM,
  APP_LOCK_PIN_HASH_KEY,
  APP_LOCK_WRAPPED_VAULT_KEY,
} from "@/lib/constants";
import { getWebCrypto } from "@/lib/web-crypto";

const WRAP_ALG = AES_GCM_ALGORITHM;
const WRAP_KEY_USAGES: KeyUsage[] = ["wrapKey", "unwrapKey"];
// The unwrapped key must keep the usages of the original vault key so it can
// actually decrypt credentials after a PIN/passkey unlock.
const UNWRAP_KEY_USAGES: KeyUsage[] = ["encrypt", "decrypt"];

function bufferToBase64(buffer: unknown): string {
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveWrapKey(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = CURRENT_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  const material = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: WRAP_ALG, length: 256 },
    false,
    WRAP_KEY_USAGES,
  );
}

/**
 * Wrap a CryptoKey (the vault encryption key) with a user secret.
 * Returns "iv:base64wrapped" string safe for localStorage.
 */
export async function wrapCryptoKey(secret: string, key: CryptoKey): Promise<string> {
  const cryptoApi = getWebCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveWrapKey(secret, salt, CURRENT_PBKDF2_ITERATIONS);
  const wrapped = await cryptoApi.subtle.wrapKey("jwk", key, wrapKey, { name: WRAP_ALG, iv });
  return `v2:${bufferToBase64(salt.buffer)}:${bufferToBase64(iv.buffer)}:${bufferToBase64(wrapped)}`;
}

export async function unwrapCryptoKey(secret: string, wrapped: string): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  const parts = wrapped.split(":");
  if (parts.length !== 4 || parts[0] !== "v2") {
    throw new Error("Malformed or unsupported wrapped key format");
  }

  const [, saltB64, ivB64, wrappedB64] = parts;
  const wrapKey = await deriveWrapKey(
    secret,
    new Uint8Array(base64ToBuffer(saltB64)),
    CURRENT_PBKDF2_ITERATIONS,
  );
  const iv = base64ToBuffer(ivB64);
  const wrappedData = base64ToBuffer(wrappedB64);

  return cryptoApi.subtle.unwrapKey(
    "jwk",
    wrappedData,
    wrapKey,
    { name: WRAP_ALG, iv },
    { name: WRAP_ALG, length: 256 },
    true,
    UNWRAP_KEY_USAGES,
  );
}

const PIN_HASH_KEY = APP_LOCK_PIN_HASH_KEY;
const WRAPPED_VAULT_KEY = APP_LOCK_WRAPPED_VAULT_KEY;

/**
 * Hash a string with SHA-256 (hex).
 */
export async function hashString(value: string): Promise<string> {
  const cryptoApi = getWebCrypto();
  const hash = (await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )) as unknown as ArrayBuffer;
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPin(pin: string): Promise<string> {
  return hashString(pin);
}

export function getStoredPinHash(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PIN_HASH_KEY);
}

export function getStoredWrappedVaultKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WRAPPED_VAULT_KEY);
}

export function storeWrappedVaultKey(wrapped: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WRAPPED_VAULT_KEY, wrapped);
}

export function clearWrappedVaultKey() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WRAPPED_VAULT_KEY);
}

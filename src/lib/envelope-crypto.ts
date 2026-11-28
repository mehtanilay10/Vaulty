/**
 * Envelope encryption for credentials using KEK + DEK pattern.
 * KEK derived from master password with 600,000 PBKDF2 iterations, DEK per credential.
 */

import {
  CURRENT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  ENCRYPTION_VERSION,
  SALT_LENGTH,
  IV_LENGTH,
} from "@/lib/constants";
import { getWebCrypto } from "@/lib/web-crypto";

/**
 * Generate a random salt
 */
function generateSalt(): string {
  const salt = getWebCrypto().getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64(salt.buffer);
}

/**
 * Generate a random IV
 */
function generateIV(): string {
  const iv = getWebCrypto().getRandomValues(new Uint8Array(IV_LENGTH));
  return arrayBufferToBase64(iv.buffer);
}

/**
 * Generate a random DEK (Data Encryption Key)
 */
async function generateDEK(): Promise<CryptoKey> {
  return getWebCrypto().subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"],
  );
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

/**
 * Convert Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert CryptoKey to JWK string
 */
async function keyToJWK(key: CryptoKey): Promise<string> {
  const exported = await getWebCrypto().subtle.exportKey("jwk", key);
  return JSON.stringify(exported);
}

/**
 * Convert JWK string to CryptoKey
 */
async function jwkToKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return getWebCrypto().subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Derive KEK (Key Encryption Key) from master password
 */
export async function deriveKEK(
  masterPassword: string,
  salt: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  const saltBuffer = base64ToArrayBuffer(salt);
  const passwordBuffer = new TextEncoder().encode(masterPassword);

  const keyMaterial = await cryptoApi.subtle.importKey("raw", passwordBuffer, "PBKDF2", false, [
    "deriveKey",
  ]);

  return cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: Math.max(CURRENT_PBKDF2_ITERATIONS, Math.min(iterations, MAX_PBKDF2_ITERATIONS)),
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt DEK with KEK
 */
export async function wrapDEK(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<{
  encryptedDEK: string;
  iv: string;
}> {
  const iv = generateIV();
  const ivBuffer = base64ToArrayBuffer(iv);

  const dekJWK = await keyToJWK(dek);
  const dekBuffer = new TextEncoder().encode(dekJWK);

  const encryptedBuffer = await getWebCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivBuffer,
    },
    kek,
    dekBuffer,
  );

  return {
    encryptedDEK: arrayBufferToBase64(encryptedBuffer),
    iv,
  };
}

/**
 * Decrypt DEK with KEK
 */
export async function unwrapDEK(
  encryptedDEK: string,
  iv: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedDEK);
  const ivBuffer = base64ToArrayBuffer(iv);

  const decryptedBuffer = await getWebCrypto().subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBuffer,
    },
    kek,
    encryptedBuffer,
  );

  const dekJWK = new TextDecoder().decode(decryptedBuffer);
  return jwkToKey(dekJWK);
}

/**
 * Encrypt data with DEK
 */
export async function encryptWithDEK(
  data: string,
  dek: CryptoKey,
): Promise<{
  encrypted: string;
  iv: string;
}> {
  const iv = generateIV();
  const ivBuffer = base64ToArrayBuffer(iv);

  const dataBuffer = new TextEncoder().encode(data);

  const encryptedBuffer = await getWebCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivBuffer,
    },
    dek,
    dataBuffer,
  );

  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    iv,
  };
}

/**
 * Decrypt data with DEK
 */
export async function decryptWithDEK(
  encrypted: string,
  iv: string,
  dek: CryptoKey,
): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(encrypted);
  const ivBuffer = base64ToArrayBuffer(iv);

  const decryptedBuffer = await getWebCrypto().subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBuffer,
    },
    dek,
    encryptedBuffer,
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Versioned encryption envelope
 */
export interface EncryptionEnvelope {
  version: number;
  kdfIterations: number;
  kekSalt: string;
  encryptedDEK: string;
  dekIV: string;
  encryptedData: string;
  dataIV: string;
}

/**
 * Encrypt data with envelope encryption
 */
export async function encryptEnvelope(
  data: string,
  masterPassword: string,
): Promise<EncryptionEnvelope> {
  const kekSalt = generateSalt();
  const kek = await deriveKEK(masterPassword, kekSalt);
  const dek = await generateDEK();

  const { encryptedDEK, iv: dekIV } = await wrapDEK(dek, kek);
  const { encrypted, iv: dataIV } = await encryptWithDEK(data, dek);

  return {
    version: ENCRYPTION_VERSION,
    kdfIterations: CURRENT_PBKDF2_ITERATIONS,
    kekSalt,
    encryptedDEK,
    dekIV,
    encryptedData: encrypted,
    dataIV,
  };
}

/**
 * Decrypt data from envelope
 */
export async function decryptEnvelope(
  envelope: EncryptionEnvelope,
  masterPassword: string,
  existingKEK?: CryptoKey,
): Promise<string> {
  const iterations = envelope.kdfIterations || CURRENT_PBKDF2_ITERATIONS;
  const kek = existingKEK || (await deriveKEK(masterPassword, envelope.kekSalt, iterations));
  const dek = await unwrapDEK(envelope.encryptedDEK, envelope.dekIV, kek);
  return decryptWithDEK(envelope.encryptedData, envelope.dataIV, dek);
}

/**
 * Encrypt data with envelope encryption using an existing KEK CryptoKey.
 * Used for auto-unlock where only the derived CryptoKey is available.
 */
export async function encryptEnvelopeWithKey(
  data: string,
  kek: CryptoKey,
  salt?: string,
): Promise<EncryptionEnvelope> {
  const kekSalt = salt || generateSalt();
  const dek = await generateDEK();

  const { encryptedDEK, iv: dekIV } = await wrapDEK(dek, kek);
  const { encrypted, iv: dataIV } = await encryptWithDEK(data, dek);

  return {
    version: ENCRYPTION_VERSION,
    kdfIterations: CURRENT_PBKDF2_ITERATIONS,
    kekSalt,
    encryptedDEK,
    dekIV,
    encryptedData: encrypted,
    dataIV,
  };
}

/**
 * Decrypt data from envelope using an existing KEK CryptoKey.
 */
export async function decryptEnvelopeWithKey(
  envelope: EncryptionEnvelope,
  kek: CryptoKey,
): Promise<string> {
  const dek = await unwrapDEK(envelope.encryptedDEK, envelope.dekIV, kek);
  return decryptWithDEK(envelope.encryptedData, envelope.dataIV, dek);
}

/**
 * Check if ciphertext uses envelope encryption
 */
export function isEnvelopeEncryption(ciphertext: string): boolean {
  try {
    const parsed = JSON.parse(ciphertext);
    return parsed?.version === ENCRYPTION_VERSION;
  } catch {
    return false;
  }
}

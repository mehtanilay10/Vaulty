/**
 * Client-side encryption utilities using Web Crypto API
 * All encryption happens client-side; server only stores encrypted data
 */

import {
  CURRENT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  SALT_LENGTH,
  IV_LENGTH,
  KEY_LENGTH,
} from "@/lib/constants";
import { getWebCrypto } from "@/lib/web-crypto";

export { CURRENT_PBKDF2_ITERATIONS, PBKDF2_ITERATIONS } from "@/lib/constants";

/**
 * Convert string to ArrayBuffer
 */
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

/**
 * Convert ArrayBuffer to string
 */
function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
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
 * Generate a random salt for key derivation
 */
export async function generateSalt(): Promise<string> {
  const salt = getWebCrypto().getRandomValues(new Uint8Array(SALT_LENGTH));
  return arrayBufferToBase64(salt.buffer);
}

/**
 * Derive encryption key from master password using PBKDF2
 */
export async function deriveKey(
  masterPassword: string,
  salt: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  const saltBuffer = base64ToArrayBuffer(salt);
  const passwordBuffer = stringToArrayBuffer(masterPassword);

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
    { name: "AES-GCM", length: KEY_LENGTH },
    // Extractable so the key can be wrapped for PIN/passkey convenience unlock.
    true,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt data using AES-GCM with random padding
 * Returns object with encrypted data (base64), IV (base64), and padding length
 */
export async function encrypt(
  data: string,
  key: CryptoKey,
): Promise<{ encrypted: string; iv: string; padding: number }> {
  const cryptoApi = getWebCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(IV_LENGTH));

  // Add random padding to hide actual data length
  const minPadding = 16;
  const maxPadding = 64;
  const paddingLength = Math.floor(Math.random() * (maxPadding - minPadding + 1)) + minPadding;
  const padding = cryptoApi.getRandomValues(new Uint8Array(paddingLength));

  const dataBuffer = stringToArrayBuffer(data);
  const combinedBuffer = new Uint8Array(dataBuffer.byteLength + paddingLength);
  combinedBuffer.set(new Uint8Array(dataBuffer), 0);
  combinedBuffer.set(padding, dataBuffer.byteLength);

  const encryptedBuffer = await cryptoApi.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    combinedBuffer.buffer,
  );

  return {
    encrypted: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv.buffer),
    padding: paddingLength,
  };
}

/**
 * Decrypt data using AES-GCM and remove padding
 */
export async function decrypt(
  encryptedData: string,
  iv: string,
  key: CryptoKey,
  paddingLength?: number,
): Promise<string> {
  const cryptoApi = getWebCrypto();
  const encryptedBuffer = base64ToArrayBuffer(encryptedData);
  const ivBuffer = base64ToArrayBuffer(iv);

  const decryptedBuffer = await cryptoApi.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBuffer,
    },
    key,
    encryptedBuffer,
  );

  // Remove padding if specified
  if (paddingLength && paddingLength > 0) {
    const dataArray = new Uint8Array(decryptedBuffer);
    const dataLength = Math.max(0, dataArray.length - paddingLength);
    const trimmedBuffer = dataArray.slice(0, dataLength);
    return arrayBufferToString(trimmedBuffer.buffer);
  }

  return arrayBufferToString(decryptedBuffer);
}

/**
 * Hash master password for client-side verification before sending to server
 * This is a quick check, actual verification happens on server with bcrypt
 */
export async function hashMasterPasswordClient(password: string): Promise<string> {
  const cryptoApi = getWebCrypto();
  const passwordBuffer = stringToArrayBuffer(password);
  const hashBuffer = await cryptoApi.subtle.digest("SHA-256", passwordBuffer);
  return arrayBufferToBase64(hashBuffer);
}

/**
 * Export the SHA-256 hash function for server-side compatibility
 */
export async function hashMasterPassword(password: string): Promise<string> {
  return hashMasterPasswordClient(password);
}

/**
 * Validate master password strength
 */
export function validateMasterPassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

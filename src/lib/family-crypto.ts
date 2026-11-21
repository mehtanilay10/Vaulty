/**
 * Client-side key material for family credential sharing.
 *
 * Each user has an RSA-OAEP key pair. The public key is stored on the server;
 * the private key is encrypted with the user's vault KEK (derived from the
 * master password) and only ever stored as ciphertext. When credentials are
 * shared, the owner wraps their vault KEK with the member's public key. The
 * server never sees a usable key or any plaintext credential.
 */

import { getWebCrypto } from "@/lib/web-crypto";

const RSA_ALGORITHM: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const RSA_IMPORT: RsaHashedImportParams = {
  name: "RSA-OAEP",
  hash: "SHA-256",
};

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
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

export async function generateFamilyKeyPair(): Promise<CryptoKeyPair> {
  return getWebCrypto().subtle.generateKey(RSA_ALGORITHM, true, ["encrypt", "decrypt"]);
}

export async function exportFamilyPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await getWebCrypto().subtle.exportKey("spki", publicKey);
  return bufferToBase64(exported);
}

export async function importFamilyPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  return getWebCrypto().subtle.importKey(
    "spki",
    base64ToBuffer(publicKeyBase64),
    RSA_IMPORT,
    true,
    ["encrypt"],
  );
}

export async function encryptFamilyPrivateKey(
  privateKey: CryptoKey,
  kek: CryptoKey,
): Promise<{ encryptedPrivateKey: string; privateKeyIv: string }> {
  const cryptoApi = getWebCrypto();
  const pkcs8 = await cryptoApi.subtle.exportKey("pkcs8", privateKey);
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const encrypted = await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv }, kek, pkcs8);

  return {
    encryptedPrivateKey: bufferToBase64(encrypted),
    privateKeyIv: bufferToBase64(iv.buffer),
  };
}

export async function decryptFamilyPrivateKey(
  encryptedPrivateKey: string,
  privateKeyIv: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const pkcs8 = await getWebCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(privateKeyIv) },
    kek,
    base64ToBuffer(encryptedPrivateKey),
  );

  return getWebCrypto().subtle.importKey("pkcs8", pkcs8, RSA_IMPORT, false, ["decrypt"]);
}

/**
 * Wrap the raw bytes of the vault KEK with a member's RSA public key.
 */
export async function wrapVaultKeyForPublicKey(
  kek: CryptoKey,
  publicKeyBase64: string,
): Promise<string> {
  if (!kek.extractable) {
    throw new Error("The vault key is not extractable and cannot be shared.");
  }

  const cryptoApi = getWebCrypto();
  const rawKey = await cryptoApi.subtle.exportKey("raw", kek);
  const publicKey = await importFamilyPublicKey(publicKeyBase64);
  const wrapped = await cryptoApi.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawKey);

  return bufferToBase64(wrapped);
}

/**
 * Unwrap an owner's vault KEK using this user's family private key.
 */
export async function unwrapVaultKeyWithPrivateKey(
  wrappedKeyBase64: string,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  const raw = await getWebCrypto().subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    base64ToBuffer(wrappedKeyBase64),
  );

  return getWebCrypto().subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export interface FamilyKeyStatus {
  hasVault: boolean;
  key: {
    publicKey: string;
    encryptedPrivateKey: string | null;
    privateKeyIv: string | null;
    updatedAt: string | null;
  } | null;
  owned: Array<{
    membershipId: string;
    member: { id: string; name: string | null; email: string | null } | null;
    memberPublicKey: string | null;
    hasWrappedKey: boolean;
    wrappedKeyUpdatedAt: string | null;
  }>;
  received: Array<{
    membershipId: string;
    owner: { id: string; name: string | null; email: string | null } | null;
    hasWrappedKey: boolean;
    wrappedKeyUpdatedAt: string | null;
  }>;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export async function fetchFamilyKeyStatus(signal?: AbortSignal): Promise<FamilyKeyStatus> {
  const response = await fetch("/api/family/credentials/key", {
    cache: "no-store",
    signal,
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || "Failed to load family key status.");
  }
  return data as FamilyKeyStatus;
}

/**
 * Ensure the signed-in user has a family key pair whose private key is
 * encrypted with the current vault KEK. Returns the public key when a key is
 * available.
 */
export async function ensureFamilyKeyPair(
  encryptionKey: CryptoKey,
  csrfHeadersValue: Record<string, string>,
  signal?: AbortSignal,
): Promise<FamilyKeyStatus["key"]> {
  const status = await fetchFamilyKeyStatus(signal);

  if (!status.hasVault) return null;

  if (status.key?.encryptedPrivateKey && status.key.privateKeyIv) {
    return status.key;
  }

  return registerNewFamilyKeyPair(encryptionKey, csrfHeadersValue, signal);
}

/**
 * Force-generate a new family key pair. Used when the existing private key can
 * no longer be decrypted with the current vault KEK (for example after a
 * master-password change). Owners re-wrap their shared keys on their next visit.
 */
export async function rotateFamilyKeyPair(
  encryptionKey: CryptoKey,
  csrfHeadersValue: Record<string, string>,
  signal?: AbortSignal,
): Promise<FamilyKeyStatus["key"]> {
  return registerNewFamilyKeyPair(encryptionKey, csrfHeadersValue, signal);
}

async function registerNewFamilyKeyPair(
  encryptionKey: CryptoKey,
  csrfHeadersValue: Record<string, string>,
  signal?: AbortSignal,
): Promise<FamilyKeyStatus["key"]> {
  const pair = await generateFamilyKeyPair();
  const publicKey = await exportFamilyPublicKey(pair.publicKey);
  const privateKey = await encryptFamilyPrivateKey(pair.privateKey, encryptionKey);

  const response = await fetch("/api/family/credentials/key", {
    method: "POST",
    headers: csrfHeadersValue,
    body: JSON.stringify({
      publicKey,
      encryptedPrivateKey: privateKey.encryptedPrivateKey,
      privateKeyIv: privateKey.privateKeyIv,
    }),
    signal,
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data.error || "Failed to register the family key.");
  }

  return data.key as FamilyKeyStatus["key"];
}

/**
 * Re-wrap this user's vault KEK for every credential-shared membership whose
 * member has registered a public key. Re-wrapping on every visit keeps keys
 * working after a master-password change or a member key regeneration.
 */
export async function syncOwnedFamilyCredentialKeys(
  encryptionKey: CryptoKey,
  csrfHeadersValue: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ wrapped: number; skipped: number }> {
  const status = await fetchFamilyKeyStatus(signal);
  let wrapped = 0;
  let skipped = 0;

  for (const membership of status.owned) {
    if (!membership.memberPublicKey) {
      skipped++;
      continue;
    }

    try {
      const wrappedKey = await wrapVaultKeyForPublicKey(encryptionKey, membership.memberPublicKey);
      const response = await fetch(`/api/family/credentials/key/${membership.membershipId}`, {
        method: "POST",
        headers: csrfHeadersValue,
        body: JSON.stringify({ wrappedKey }),
        signal,
      });

      if (response.ok) {
        wrapped++;
      } else {
        const errorData = await readJson(response);
        console.error(
          `Failed to sync family credential key for membership ${membership.membershipId}: HTTP ${response.status}`,
          errorData,
        );
        skipped++;
      }
    } catch (error) {
      console.error("Failed to wrap family credential key:", error);
      skipped++;
    }
  }

  return { wrapped, skipped };
}

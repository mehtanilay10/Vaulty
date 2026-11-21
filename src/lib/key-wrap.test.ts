import { describe, it, expect } from "vitest";
import { wrapCryptoKey, unwrapCryptoKey, hashPin, hashString } from "./key-wrap";
import { deriveKEK } from "./envelope-crypto";

describe("key-wrap", () => {
  const masterPassword = "TestMasterPassword123!";
  const salt = "dGVzdC1zYWx0LTEyMzQ1Njc4OQ==";

  it("hashes a PIN deterministically with SHA-256", async () => {
    const pin = "1234";
    const hash1 = await hashPin(pin);
    const hash2 = await hashPin(pin);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes general strings correctly", async () => {
    const hashed = await hashString("hello-world");
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  it("wraps and unwraps a CryptoKey with a secret", async () => {
    const kek = await deriveKEK(masterPassword, salt, 1000);
    const pinHash = await hashPin("4321");

    const wrapped = await wrapCryptoKey(pinHash, kek);
    expect(typeof wrapped).toBe("string");

    const unwrapped = await unwrapCryptoKey(pinHash, wrapped);
    expect(unwrapped).toBeDefined();
    expect(unwrapped.algorithm.name).toBe("AES-GCM");
  });

  it("fails to unwrap when given the wrong secret", async () => {
    const kek = await deriveKEK(masterPassword, salt, 1000);
    const pinHash = await hashPin("4321");
    const wrongPinHash = await hashPin("9999");

    const wrapped = await wrapCryptoKey(pinHash, kek);
    await expect(unwrapCryptoKey(wrongPinHash, wrapped)).rejects.toThrow();
  });
});

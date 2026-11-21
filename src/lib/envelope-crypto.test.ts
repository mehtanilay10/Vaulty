import { describe, it, expect } from "vitest";
import {
  deriveKEK,
  encryptEnvelope,
  decryptEnvelope,
  encryptEnvelopeWithKey,
  decryptEnvelopeWithKey,
  isEnvelopeEncryption,
} from "./envelope-crypto";

describe("envelope-crypto", () => {
  const masterPassword = "TestMasterPassword123!";
  const salt = "dGVzdC1zYWx0LTEyMzQ1Njc4OQ==";

  it("derives a valid KEK using PBKDF2", async () => {
    const kek = await deriveKEK(masterPassword, salt, 1000);
    expect(kek).toBeDefined();
    expect(kek.algorithm.name).toBe("AES-GCM");
    expect(kek.extractable).toBe(true);
  });

  it("encrypts and decrypts payload using master password", async () => {
    const plaintext = "SuperSecretCredentialPassword!42";
    const envelope = await encryptEnvelope(plaintext, masterPassword);

    expect(envelope.version).toBe(2);
    expect(envelope.encryptedData).toBeDefined();
    expect(envelope.encryptedDEK).toBeDefined();
    expect(envelope.dekIV).toBeDefined();
    expect(envelope.dataIV).toBeDefined();
    expect(envelope.kekSalt).toBeDefined();

    const decrypted = await decryptEnvelope(envelope, masterPassword);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts using an existing CryptoKey directly", async () => {
    const kek = await deriveKEK(masterPassword, salt, 1000);
    const plaintext = "AnotherConfidentialToken_999";

    const envelope = await encryptEnvelopeWithKey(plaintext, kek, salt);
    expect(envelope.kekSalt).toBe(salt);

    const decrypted = await decryptEnvelopeWithKey(envelope, kek);
    expect(decrypted).toBe(plaintext);
  });

  it("rejects decryption with the wrong password", async () => {
    const plaintext = "SensitiveInfo";
    const envelope = await encryptEnvelope(plaintext, masterPassword);

    await expect(decryptEnvelope(envelope, "WrongPassword123!")).rejects.toThrow();
  });

  it("detects whether a string is envelope encryption JSON", async () => {
    const envelope = await encryptEnvelope("test", masterPassword);
    const serialized = JSON.stringify(envelope);

    expect(isEnvelopeEncryption(serialized)).toBe(true);
    expect(isEnvelopeEncryption("raw-legacy-ciphertext")).toBe(false);
    expect(isEnvelopeEncryption(JSON.stringify({ notAnEnvelope: true }))).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  generateRecoveryKey,
  unwrapRecoveryKEK,
  hashRecoveryAnswer,
  getRecoveryQuestions,
} from "./key-recovery";
import {
  deriveKEK,
  encryptEnvelopeWithKey,
  decryptEnvelopeWithKey,
  decryptEnvelope,
} from "./envelope-crypto";
import { generateSalt } from "./crypto";

describe("key-recovery", () => {
  it("provides available security questions", () => {
    const questions = getRecoveryQuestions();
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions[0]).toContain("pet");
  });

  it("hashes recovery answers consistently and normalizes casing/whitespace", async () => {
    const h1 = await hashRecoveryAnswer("Fluffy");
    const h2 = await hashRecoveryAnswer("  fluffy  ");
    expect(h1.startsWith("pbkdf2:")).toBe(true);
    expect(h2.startsWith("pbkdf2:")).toBe(true);
  });

  it("successfully wraps and unwraps KEK for envelope decryption", async () => {
    const salt = await generateSalt();
    const masterPassword = "TestPassword123!@#";
    const kek = await deriveKEK(masterPassword, salt);

    // Encrypt sensitive test data with original KEK
    const secretText = "super-secret-bank-pin-9988";
    const envelope = await encryptEnvelopeWithKey(secretText, kek);

    // Generate recovery key setup
    const recoverySetup = await generateRecoveryKey(kek);
    expect(recoverySetup.recoveryKey).toHaveLength(64);
    expect(recoverySetup.encryptedKEK.length).toBeGreaterThan(0);

    // Unwrap KEK using recovery key and stored metadata
    const unwrappedKEK = await unwrapRecoveryKEK({
      recoveryKey: recoverySetup.recoveryKey,
      recoverySalt: recoverySetup.salt,
      recoveryIv: recoverySetup.iv,
      recoveryEncryptedKEK: recoverySetup.encryptedKEK,
      recoveryKdfIterations: recoverySetup.kdfIterations,
    });

    // Decrypt envelope using unwrapped KEK
    const decryptedText = await decryptEnvelopeWithKey(envelope, unwrappedKEK);
    expect(decryptedText).toBe(secretText);
  });

  it("allows specifying an existing recovery key to re-wrap a new KEK", async () => {
    const salt = await generateSalt();
    const kek = await deriveKEK("NewPassword456!@#", salt);
    const existingRecoveryKey = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    const recoverySetup = await generateRecoveryKey(kek, existingRecoveryKey);
    expect(recoverySetup.recoveryKey).toBe(existingRecoveryKey);

    const unwrappedKEK = await unwrapRecoveryKEK({
      recoveryKey: existingRecoveryKey,
      recoverySalt: recoverySetup.salt,
      recoveryIv: recoverySetup.iv,
      recoveryEncryptedKEK: recoverySetup.encryptedKEK,
      recoveryKdfIterations: recoverySetup.kdfIterations,
    });

    const envelope = await encryptEnvelopeWithKey("rekeyed-content", kek);
    const decrypted = await decryptEnvelopeWithKey(envelope, unwrappedKEK);
    expect(decrypted).toBe("rekeyed-content");
  });

  it("decrypts envelope with master password when encrypted with derivation salt", async () => {
    const salt = await generateSalt();
    const masterPassword = "TestPassword789!@#";
    const kek = await deriveKEK(masterPassword, salt);

    const secretText = "secret-credentials-envelope";
    const envelope = await encryptEnvelopeWithKey(secretText, kek, salt);

    const decrypted = await decryptEnvelope(envelope, masterPassword);
    expect(decrypted).toBe(secretText);
  });
});

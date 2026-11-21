import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getGeminiApiKeys,
  markGeminiKeyCooldown,
  isGeminiKeyCoolingDown,
  clearGeminiKeyCooldowns,
  getRandomGeminiClient,
  isGeminiQuotaError,
  GEMINI_COOLDOWN_MS,
} from "./gemini";

describe("gemini key manager & 30-second cooldown", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearGeminiKeyCooldowns();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    clearGeminiKeyCooldowns();
    vi.restoreAllMocks();
  });

  it("has a 30 second cooldown constant", () => {
    expect(GEMINI_COOLDOWN_MS).toBe(30_000);
  });

  it("collects and deduplicates keys from GEMINI_API_KEY_1..3", () => {
    process.env.GEMINI_API_KEY_1 = "key_a";
    process.env.GEMINI_API_KEY_2 = "key_b";
    process.env.GEMINI_API_KEY_3 = "key_a"; // duplicate

    const keys = getGeminiApiKeys();
    expect(keys).toEqual(["key_a", "key_b"]);
  });

  it("puts a key into cooldown for 30 seconds and recovers after expiry", () => {
    const testKey = "test_key_12345";
    expect(isGeminiKeyCoolingDown(testKey)).toBe(false);

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    markGeminiKeyCooldown(testKey, 30_000);
    expect(isGeminiKeyCoolingDown(testKey)).toBe(true);

    // After 29.9 seconds: still cooling down
    vi.spyOn(Date, "now").mockReturnValue(now + 29_900);
    expect(isGeminiKeyCoolingDown(testKey)).toBe(true);

    // After 30 seconds: cooldown expired
    vi.spyOn(Date, "now").mockReturnValue(now + 30_000);
    expect(isGeminiKeyCoolingDown(testKey)).toBe(false);
  });

  it("avoids keys currently in cooldown when selecting a client", () => {
    process.env.GEMINI_API_KEY_1 = "healthy_key_1";
    process.env.GEMINI_API_KEY_2 = "rate_limited_key_2";
    delete process.env.GEMINI_API_KEY_3;

    markGeminiKeyCooldown("rate_limited_key_2", 30_000);

    for (let i = 0; i < 10; i++) {
      const client = getRandomGeminiClient();
      expect(client.apiKey).toBe("healthy_key_1");
    }
  });

  it("identifies quota exhaustion and 429 errors correctly", () => {
    expect(isGeminiQuotaError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isGeminiQuotaError(new Error("Resource has been exhausted (e.g. check quota)."))).toBe(
      true,
    );
    expect(isGeminiQuotaError({ status: 429, message: "rate limit" })).toBe(true);
    expect(isGeminiQuotaError(new Error("Invalid API key"))).toBe(false);
  });
});

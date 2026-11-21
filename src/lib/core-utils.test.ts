import { describe, expect, it, vi } from "vitest";
import { getWebCrypto } from "@/lib/web-crypto";
import { createRequestCache, clearRequestCache } from "@/lib/request-cache";
import { parseJsonRecord, readJsonRecord } from "@/lib/api-validation";
import { isValidEmailAddress } from "@/lib/email";
import { validateSharePassword, hashSharePassword, verifySharePassword } from "@/lib/share-crypto";
import { normalizeOptionalString, normalizeStringArray } from "@/lib/wealth";
import { createProvider } from "@/lib/storage/factory";
import type { StorageProviderType, StorageProviderContext } from "@/lib/storage/provider";
import { sha256Hex, hashResetToken } from "@/lib/server-crypto";

describe("Web Crypto SSR Guards", () => {
  it("provides crypto instance across environments without throwing", () => {
    const cryptoApi = getWebCrypto();
    expect(cryptoApi).toBeDefined();
    expect(typeof cryptoApi.getRandomValues).toBe("function");
  });
});

describe("Request Cache", () => {
  it("handles circular references gracefully in arguments without throwing", async () => {
    clearRequestCache();
    const circularObj: Record<string, unknown> = { a: 1 };
    circularObj.self = circularObj;

    const fetchMock = vi.fn().mockResolvedValue("success");
    const cachedFetch = createRequestCache(fetchMock, "test-circular");

    const result = await cachedFetch(circularObj);
    expect(result).toBe("success");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches successful promises and removes failed ones so they can retry", async () => {
    clearRequestCache();
    let callCount = 0;
    const flakyFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Network transient error");
      return "retry success";
    });

    const cachedFetch = createRequestCache(flakyFetch, "test-retry");

    await expect(cachedFetch("id-1")).rejects.toThrow("Network transient error");
    const result = await cachedFetch("id-1");
    expect(result).toBe("retry success");
    expect(flakyFetch).toHaveBeenCalledTimes(2);
  });
});

describe("API JSON Validation helper", () => {
  it("distinguishes between invalid JSON and non-object JSON", async () => {
    const invalidJsonReq = {
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    };
    const invalidResult = await parseJsonRecord(invalidJsonReq);
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toBe("invalid_json");

    const arrayReq = {
      json: vi.fn().mockResolvedValue(["item1", "item2"]),
    };
    const arrayResult = await parseJsonRecord(arrayReq);
    expect(arrayResult.success).toBe(false);
    expect(arrayResult.error).toBe("not_an_object");

    const validReq = {
      json: vi.fn().mockResolvedValue({ name: "Vaulty", count: 42 }),
    };
    const validResult = await parseJsonRecord(validReq);
    expect(validResult.success).toBe(true);
    expect(validResult.data).toEqual({ name: "Vaulty", count: 42 });
    expect(validResult.error).toBeNull();
  });

  it("readJsonRecord supports detailed flag and legacy return format", async () => {
    const invalidJsonReq = {
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    };
    const legacy = await readJsonRecord(invalidJsonReq);
    expect(legacy).toBeNull();

    const detailed = await readJsonRecord(invalidJsonReq, { detailed: true });
    expect(detailed).toEqual({ success: false, data: null, error: "invalid_json" });
  });
});

describe("Email format validation", () => {
  it("validates RFC-compliant email formats and rejects invalid strings", () => {
    expect(isValidEmailAddress("user@example.com")).toBe(true);
    expect(isValidEmailAddress("john.doe+vaulty@gmail.co.uk")).toBe(true);
    expect(isValidEmailAddress("")).toBe(false);
    expect(isValidEmailAddress("plainaddress")).toBe(false);
    expect(isValidEmailAddress("@missingusername.com")).toBe(false);
    expect(isValidEmailAddress("missingdomain@")).toBe(false);
    expect(isValidEmailAddress("user@.com")).toBe(false);
  });
});

describe("Share Password Crypto Validation", () => {
  it("validates password length and rejects weak/empty passwords", () => {
    expect(validateSharePassword("").isValid).toBe(false);
    expect(validateSharePassword("short").isValid).toBe(false);
    expect(validateSharePassword("validPass123").isValid).toBe(true);
    expect(() => hashSharePassword("123")).toThrow(/at least 8 characters/);
  });

  it("hashes and verifies share password properly", () => {
    const hash = hashSharePassword("secureShareKey99");
    expect(hash).toMatch(/^scrypt:/);
    expect(verifySharePassword("secureShareKey99", hash)).toBe(true);
    expect(verifySharePassword("wrongKey123", hash)).toBe(false);
    expect(verifySharePassword("", hash)).toBe(false);
    expect(verifySharePassword("secureShareKey99", null)).toBe(false);
  });
});

describe("Wealth Utility Functions Input Bounds", () => {
  it("normalizes optional string with maximum length limits", () => {
    expect(normalizeOptionalString("   hello   ")).toBe("hello");
    expect(normalizeOptionalString("")).toBeNull();
    expect(normalizeOptionalString("   ")).toBeNull();
    expect(normalizeOptionalString(123)).toBeNull();

    const hugeString = "a".repeat(2000);
    const clamped = normalizeOptionalString(hugeString, 50);
    expect(clamped?.length).toBe(50);
  });

  it("normalizes string array with bounds on item count and string lengths", () => {
    const items = Array.from({ length: 150 }, (_, i) => `item-${i}`);
    const normalized = normalizeStringArray(items, 100, 10);
    expect(normalized.length).toBe(10);
    expect(normalized[0]).toBe("item-0");
  });
});

describe("Storage Provider Factory", () => {
  it("throws error for unsupported storage provider types", () => {
    expect(() =>
      createProvider(
        "DROPBOX" as unknown as StorageProviderType,
        {
          user: {},
        } as unknown as StorageProviderContext,
      ),
    ).toThrow(/Unsupported storage provider type/);
  });
});

describe("Server Crypto SHA-256 Helpers", () => {
  it("computes deterministic SHA-256 hex digest", () => {
    const digest1 = sha256Hex("vaulty-test-string");
    const digest2 = sha256Hex("vaulty-test-string");
    expect(digest1).toBe(digest2);
    expect(digest1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes reset tokens consistently with hashResetToken", () => {
    const token = "abcdef1234567890abcdef1234567890";
    const hashed = hashResetToken(token);
    expect(hashed).toBe(sha256Hex(token));
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });
});

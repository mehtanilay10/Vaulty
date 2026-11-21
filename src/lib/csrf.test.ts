import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateCSRFToken,
  validateCSRFRequest,
  validateOrigin,
  verifyCSRFToken,
} from "@/lib/csrf";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_CSRF_SECRET = process.env.CSRF_SECRET;
const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;

function restoreEnvironment() {
  if (ORIGINAL_NODE_ENV === undefined) delete (process.env as { NODE_ENV?: string }).NODE_ENV;
  else (process.env as { NODE_ENV?: string }).NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_CSRF_SECRET === undefined) delete process.env.CSRF_SECRET;
  else process.env.CSRF_SECRET = ORIGINAL_CSRF_SECRET;
  if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
}

describe("CSRF token protection", () => {
  afterEach(() => {
    restoreEnvironment();
    vi.useRealTimers();
  });

  it("generates and verifies a signed token", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    process.env.CSRF_SECRET = "test-csrf-secret-that-is-at-least-32-characters";

    const token = generateCSRFToken();
    expect(verifyCSRFToken(token)).toBe(true);
  });

  it("rejects tampered tokens", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    process.env.CSRF_SECRET = "test-csrf-secret-that-is-at-least-32-characters";

    const token = generateCSRFToken();
    expect(verifyCSRFToken(`${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`)).toBe(false);
  });

  it("rejects expired tokens", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    process.env.CSRF_SECRET = "test-csrf-secret-that-is-at-least-32-characters";
    vi.useFakeTimers();
    const token = generateCSRFToken();
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect(verifyCSRFToken(token)).toBe(false);
  });

  it("requires a dedicated secret in production and never falls back to AUTH_SECRET", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    delete process.env.CSRF_SECRET;
    process.env.AUTH_SECRET = "auth-secret-that-is-long-enough-but-not-csrf";

    expect(() => generateCSRFToken()).toThrow(/CSRF_SECRET must be configured in production/);
  });

  it("requires the same valid token in the header and cookie", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    process.env.CSRF_SECRET = "test-csrf-secret-that-is-at-least-32-characters";
    const token = generateCSRFToken();

    const validRequest = new Request("https://vaulty.test/api/example", {
      headers: { "x-csrf-token": token, cookie: `csrf-token=${encodeURIComponent(token)}` },
    });
    const mismatchedRequest = new Request("https://vaulty.test/api/example", {
      headers: { "x-csrf-token": token, cookie: "csrf-token=another-token" },
    });

    expect(validateCSRFRequest(validRequest)).toBe(true);
    expect(validateCSRFRequest(mismatchedRequest)).toBe(false);
  });

  describe("validateOrigin", () => {
    it("allows localhost in non-production", () => {
      (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
      const req = new Request("http://localhost:3000/api/test", {
        headers: { origin: "http://localhost:3000" },
      });
      expect(validateOrigin(req)).toBe(true);
    });

    it("rejects localhost in production if not in NEXTAUTH_URL", () => {
      (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
      process.env.NEXTAUTH_URL = "https://app.vaulty.com";
      const req = new Request("https://app.vaulty.com/api/test", {
        headers: { origin: "http://localhost:3000" },
      });
      expect(validateOrigin(req)).toBe(false);
    });

    it("allows configured origin in production", () => {
      (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
      process.env.NEXTAUTH_URL = "https://app.vaulty.com";
      const req = new Request("https://app.vaulty.com/api/test", {
        headers: { origin: "https://app.vaulty.com" },
      });
      expect(validateOrigin(req)).toBe(true);
    });

    it("handles invalid or malformed origin URLs safely without throwing", () => {
      (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
      process.env.NEXTAUTH_URL = "https://app.vaulty.com";
      const req = new Request("https://app.vaulty.com/api/test", {
        headers: { origin: "null" },
      });
      expect(validateOrigin(req)).toBe(false);

      const malformedReq = new Request("https://app.vaulty.com/api/test", {
        headers: { origin: "not-a-valid-url" },
      });
      expect(validateOrigin(malformedReq)).toBe(false);
    });

    it("rejects requests missing origin and referer in production", () => {
      (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
      process.env.NEXTAUTH_URL = "https://app.vaulty.com";
      const req = new Request("https://app.vaulty.com/api/test");
      expect(validateOrigin(req)).toBe(false);
    });
  });
});

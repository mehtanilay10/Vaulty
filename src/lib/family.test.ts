import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FAMILY_INVITATION_TTL_DAYS,
  FAMILY_INVITATION_TTL_MS,
  buildFamilyInviteUrl,
  createFamilyInvitationToken,
  getAppBaseUrl,
  getFamilyInvitationExpiry,
  isFamilyInvitationExpired,
} from "@/lib/family";

const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

describe("family invitation tokens", () => {
  it("creates unique URL-safe tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createFamilyInvitationToken()));

    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 random bytes base64url-encoded are 43 characters.
      expect(token.length).toBe(43);
    }
  });
});

describe("family invitation expiry", () => {
  it("expires seven days after creation", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const expiry = getFamilyInvitationExpiry(from);

    expect(FAMILY_INVITATION_TTL_DAYS).toBe(7);
    expect(expiry.getTime() - from.getTime()).toBe(FAMILY_INVITATION_TTL_MS);
  });

  it("treats the exact expiry instant as expired", () => {
    const now = new Date("2026-01-08T00:00:00.000Z");

    expect(isFamilyInvitationExpired(new Date(now), now)).toBe(true);
    expect(isFamilyInvitationExpired(new Date(now.getTime() + 1), now)).toBe(false);
    expect(isFamilyInvitationExpired(new Date(now.getTime() - 1), now)).toBe(true);
  });

  it("accepts ISO strings and rejects invalid dates", () => {
    const now = new Date("2026-01-08T00:00:00.000Z");

    expect(isFamilyInvitationExpired("2026-01-09T00:00:00.000Z", now)).toBe(false);
    expect(isFamilyInvitationExpired("not-a-date", now)).toBe(true);
  });
});

describe("family invite links", () => {
  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  afterEach(() => {
    if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
  });

  it("falls back to localhost", () => {
    expect(getAppBaseUrl()).toBe("http://localhost:3000");
  });

  it("prefers NEXTAUTH_URL and strips a trailing slash", () => {
    process.env.NEXTAUTH_URL = "https://vaulty.example/";

    expect(getAppBaseUrl()).toBe("https://vaulty.example");
    expect(buildFamilyInviteUrl("abc 123")).toBe(
      "https://vaulty.example/family/accept?token=abc%20123",
    );
  });
});

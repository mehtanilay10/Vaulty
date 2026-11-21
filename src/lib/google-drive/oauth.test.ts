import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleDriveAuthUrl, revokeGoogleTokens, verifyGoogleDriveOAuthState } from "./oauth";

describe("Google Drive OAuth", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;

  beforeEach(() => {
    process.env.AUTH_SECRET = "super-secret-auth-key-at-least-32-chars-long";
    process.env.GOOGLE_CLIENT_ID = "mock-client-id.apps.googleusercontent.com";
  });

  afterEach(() => {
    process.env.AUTH_SECRET = originalAuthSecret;
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    vi.restoreAllMocks();
  });

  describe("createGoogleDriveAuthUrl and verifyGoogleDriveOAuthState", () => {
    it("generates an authorization URL with a verifiable HMAC-signed state", () => {
      const url = createGoogleDriveAuthUrl("user-123");
      const parsedUrl = new URL(url);
      const state = parsedUrl.searchParams.get("state");
      expect(state).toBeTruthy();

      const verifiedUserId = verifyGoogleDriveOAuthState(state);
      expect(verifiedUserId).toBe("user-123");
    });

    it("rejects invalid, malformed, or tampered state parameters", () => {
      expect(verifyGoogleDriveOAuthState(null)).toBeNull();
      expect(verifyGoogleDriveOAuthState("")).toBeNull();
      expect(verifyGoogleDriveOAuthState("plain-base64-not-hmac")).toBeNull();

      const url = createGoogleDriveAuthUrl("user-123");
      const state = new URL(url).searchParams.get("state")!;
      const [payload, signature] = state.split(".");

      // Tampered payload
      const tamperedPayload = Buffer.from(
        JSON.stringify({ userId: "attacker", expiresAt: Date.now() + 60000 }),
      ).toString("base64url");
      expect(verifyGoogleDriveOAuthState(`${tamperedPayload}.${signature}`)).toBeNull();

      // Tampered signature
      expect(verifyGoogleDriveOAuthState(`${payload}.invalidsignature`)).toBeNull();
    });

    it("rejects expired state parameter", () => {
      const expiredTime = Date.now() - 1000;
      const payload = Buffer.from(
        JSON.stringify({ userId: "user-123", expiresAt: expiredTime }),
      ).toString("base64url");
      const signature = createHmac("sha256", process.env.AUTH_SECRET!)
        .update(payload)
        .digest("base64url");
      const expiredState = `${payload}.${signature}`;

      expect(verifyGoogleDriveOAuthState(expiredState)).toBeNull();
    });
  });

  describe("revokeGoogleTokens", () => {
    it("succeeds when revoke endpoint responds with 200 OK", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as unknown as Response);

      await expect(revokeGoogleTokens("mock-access-token")).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/revoke?token=mock-access-token",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("throws an error when revoke endpoint responds with non-OK status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      } as unknown as Response);

      await expect(revokeGoogleTokens("mock-access-token")).rejects.toThrow(
        "Failed to revoke Google token: Bad Request",
      );
    });
  });
});

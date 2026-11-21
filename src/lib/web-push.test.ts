import { createECDH, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, deleteManyMock, setVapidDetailsMock, sendNotificationMock } = vi.hoisted(
  () => ({
    findManyMock: vi.fn(),
    deleteManyMock: vi.fn(),
    setVapidDetailsMock: vi.fn(),
    sendNotificationMock: vi.fn(),
  }),
);

vi.mock("web-push", () => ({
  setVapidDetails: setVapidDetailsMock,
  sendNotification: sendNotificationMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: findManyMock,
      deleteMany: deleteManyMock,
    },
  },
}));

import {
  isValidPushEndpoint,
  sendPushToUser,
  encryptPushSecret,
  decryptPushSecret,
} from "@/lib/web-push";

describe("Web Push adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const vapidKeyPair = createECDH("prime256v1");
    vapidKeyPair.generateKeys();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapidKeyPair.getPublicKey().toString("base64url"));
    vi.stubEnv("VAPID_PRIVATE_KEY", vapidKeyPair.getPrivateKey().toString("base64url"));
    vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:security@example.com");
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters-long");

    findManyMock.mockResolvedValue([
      {
        id: "subscription-1",
        endpoint: "https://push.example.com/send/opaque-token?key=value",
        p256dh: encryptPushSecret(createECDH("prime256v1").generateKeys().toString("base64url")),
        auth: encryptPushSecret(randomBytes(16).toString("base64url")),
      },
    ]);
    deleteManyMock.mockResolvedValue({ count: 1 });
    sendNotificationMock.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts push subscription secrets at rest", () => {
    const encrypted = encryptPushSecret("subscription-secret");
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("subscription-secret");
    expect(decryptPushSecret(encrypted)).toBe("subscription-secret");
    expect(() => decryptPushSecret("legacy-plaintext")).toThrow(
      "Invalid or unencrypted push subscription secret.",
    );
  });

  it("accepts HTTPS push service endpoints and rejects unsafe endpoints", () => {
    expect(isValidPushEndpoint("https://push.example.com/send/token?key=value")).toBe(true);
    expect(isValidPushEndpoint("http://push.example.com/send/token")).toBe(false);
    expect(isValidPushEndpoint("https://localhost/send/token")).toBe(false);
    expect(isValidPushEndpoint("https://127.0.0.1/send/token")).toBe(false);
    expect(isValidPushEndpoint("https://user:pass@push.example.com/send/token")).toBe(false);
  });

  it("uses web-push VAPID configuration and its subscription/payload contract", async () => {
    const result = await sendPushToUser("user-1", {
      title: "Reminder",
      body: "Your policy expires soon.",
      url: "/reminders",
    });

    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      "mailto:security@example.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    expect(sendNotificationMock).toHaveBeenCalledWith(
      {
        endpoint: "https://push.example.com/send/opaque-token?key=value",
        keys: expect.objectContaining({ p256dh: expect.any(String), auth: expect.any(String) }),
      },
      expect.stringContaining('"title":"Reminder"'),
      { TTL: 86400, urgency: "high" },
    );
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it("decrypts encrypted subscription keys only for the provider call", async () => {
    const p256dh = createECDH("prime256v1").generateKeys().toString("base64url");
    const auth = randomBytes(16).toString("base64url");
    findManyMock.mockResolvedValueOnce([
      {
        id: "encrypted-subscription",
        endpoint: "https://push.example.com/send/encrypted",
        p256dh: encryptPushSecret(p256dh),
        auth: encryptPushSecret(auth),
      },
    ]);
    await sendPushToUser("user-1", { title: "Encrypted", body: "Payload" });
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ keys: { p256dh, auth } }),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("removes subscriptions rejected as expired by a push service", async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 410 });

    const result = await sendPushToUser("user-1", { title: "Reminder", body: "Expired" });

    expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: "subscription-1" } });
    expect(result).toEqual({ sent: 0, failed: 1 });
  });
});

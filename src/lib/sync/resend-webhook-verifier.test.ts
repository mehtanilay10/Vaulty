import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyResendWebhookSignature } from "./resend-webhook-verifier";

describe("verifyResendWebhookSignature", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPA1ZqqMyTCyaEdjy";
  const rawKey = Buffer.from("MfKQ9r8GKYqrTwjUPA1ZqqMyTCyaEdjy", "base64");
  const payload = JSON.stringify({ type: "email.received", data: { subject: "Test" } });
  const svixId = "msg_p5j2GeDrewKZu8DxpIyu";

  it("successfully verifies a valid signature within tolerance", () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const toSign = `${svixId}.${timestamp}.${payload}`;
    const signature = createHmac("sha256", rawKey).update(toSign).digest("base64");

    const isValid = verifyResendWebhookSignature({
      secret,
      payload,
      svixId,
      svixTimestamp: timestamp,
      svixSignature: `v1,${signature}`,
    });

    expect(isValid).toBe(true);
  });

  it("accepts valid signature among multiple space-separated candidates", () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const toSign = `${svixId}.${timestamp}.${payload}`;
    const signature = createHmac("sha256", rawKey).update(toSign).digest("base64");

    const isValid = verifyResendWebhookSignature({
      secret,
      payload,
      svixId,
      svixTimestamp: timestamp,
      svixSignature: `v1,old_invalid_sig v1,${signature}`,
    });

    expect(isValid).toBe(true);
  });

  it("rejects an expired timestamp outside tolerance", () => {
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
    const toSign = `${svixId}.${expiredTimestamp}.${payload}`;
    const signature = createHmac("sha256", rawKey).update(toSign).digest("base64");

    const isValid = verifyResendWebhookSignature({
      secret,
      payload,
      svixId,
      svixTimestamp: expiredTimestamp,
      svixSignature: `v1,${signature}`,
    });

    expect(isValid).toBe(false);
  });

  it("rejects an altered payload", () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const toSign = `${svixId}.${timestamp}.${payload}`;
    const signature = createHmac("sha256", rawKey).update(toSign).digest("base64");

    const isValid = verifyResendWebhookSignature({
      secret,
      payload: payload + " altered",
      svixId,
      svixTimestamp: timestamp,
      svixSignature: `v1,${signature}`,
    });

    expect(isValid).toBe(false);
  });

  it("rejects missing headers or secrets", () => {
    expect(
      verifyResendWebhookSignature({
        secret: "",
        payload,
        svixId,
        svixTimestamp: "123",
        svixSignature: "v1,abc",
      }),
    ).toBe(false);

    expect(
      verifyResendWebhookSignature({
        secret,
        payload,
        svixId: null,
        svixTimestamp: "123",
        svixSignature: "v1,abc",
      }),
    ).toBe(false);
  });
});

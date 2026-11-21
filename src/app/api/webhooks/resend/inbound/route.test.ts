import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import * as inboundService from "@/lib/sync/inbound-email-service";

vi.mock("@/lib/sync/inbound-email-service", () => ({
  resolveUserForInboundEmail: vi.fn(),
  processInboundEmail: vi.fn(),
}));

describe("POST /api/webhooks/resend/inbound", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPA1ZqqMyTCyaEdjy";
  const rawKey = Buffer.from("MfKQ9r8GKYqrTwjUPA1ZqqMyTCyaEdjy", "base64");

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_INBOUND_WEBHOOK_SECRET = secret;
  });

  function createSignedRequest(bodyObj: Record<string, unknown>, validSignature = true) {
    const rawBody = JSON.stringify(bodyObj);
    const svixId = "msg_test123";
    const svixTimestamp = Math.floor(Date.now() / 1000).toString();
    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
    const hmac = createHmac("sha256", rawKey).update(toSign).digest("base64");
    const svixSignature = validSignature ? `v1,${hmac}` : "v1,invalid_signature";

    return new NextRequest("http://localhost:3000/api/webhooks/resend/inbound", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      },
      body: rawBody,
    });
  }

  it("rejects request when Svix webhook signature is invalid", async () => {
    const req = createSignedRequest({ type: "email.received" }, false);
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid webhook signature.");
  });

  it("accepts valid request and routes to processInboundEmail", async () => {
    vi.mocked(inboundService.resolveUserForInboundEmail).mockResolvedValueOnce({
      id: "user-1",
      email: "nilay@gmail.com",
      name: "Nilay",
    });

    vi.mocked(inboundService.processInboundEmail).mockResolvedValueOnce({
      userId: "user-1",
      messageId: "resend-msg-99",
      attachmentsSaved: 1,
      transactionsExtracted: 2,
      documentsDiscovered: 1,
      remindersDiscovered: 1,
    });

    const payload = {
      type: "email.received",
      data: {
        email_id: "resend-msg-99",
        from: "alerts@bank.com",
        to: ["nilay+docs@vaulty.mnilay.com"],
        subject: "Your Monthly Account Statement",
        text: "Please find attached your statement.",
        attachments: [
          {
            filename: "oct_statement.pdf",
            content_type: "application/pdf",
            content: Buffer.from("pdf-data").toString("base64"),
          },
        ],
      },
    };

    const req = createSignedRequest(payload, true);
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.received).toBe(true);
    expect(data.status).toBe("PROCESSED");

    expect(inboundService.resolveUserForInboundEmail).toHaveBeenCalledWith(
      "nilay+docs@vaulty.mnilay.com",
      "alerts@bank.com",
    );

    expect(inboundService.processInboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        from: "alerts@bank.com",
        to: "nilay+docs@vaulty.mnilay.com",
        subject: "Your Monthly Account Statement",
        messageId: "resend-msg-99",
        attachments: [
          expect.objectContaining({
            filename: "oct_statement.pdf",
            mimeType: "application/pdf",
          }),
        ],
      }),
    );
  });
});

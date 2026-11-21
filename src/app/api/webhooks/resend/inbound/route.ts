import { NextRequest, NextResponse } from "next/server";
import { verifyResendWebhookSignature } from "@/lib/sync/resend-webhook-verifier";
import {
  resolveUserForInboundEmail,
  processInboundEmail,
  type InboundEmailAttachmentInput,
} from "@/lib/sync/inbound-email-service";
import { cleanAddress } from "@/lib/sync/email-sync-engine";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const svixId = req.headers.get("svix-id");
      const svixTimestamp = req.headers.get("svix-timestamp");
      const svixSignature = req.headers.get("svix-signature");

      const isValid = verifyResendWebhookSignature({
        secret: webhookSecret,
        payload: rawBody,
        svixId,
        svixTimestamp,
        svixSignature,
      });

      if (!isValid) {
        console.error("[resend-inbound-webhook] Invalid signature verification");
        return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const eventType = (payload.type as string) || "";
    // Resend triggers "email.received" or "inbox.email.received"
    if (eventType && !eventType.includes("received")) {
      return NextResponse.json({ received: true, ignored: `Event ${eventType} not handled` });
    }

    const data = (payload.data as Record<string, unknown>) || payload;
    const emailId = (data.email_id as string) || (data.id as string) || `resend_${Date.now()}`;
    const from = (data.from as string) || "";
    const toRecipients = Array.isArray(data.to)
      ? (data.to as string[])
      : typeof data.to === "string"
        ? [data.to]
        : [];
    const subject = (data.subject as string) || "No Subject";
    const textBody = (data.text as string) || "";
    const htmlBody = (data.html as string) || "";

    if (toRecipients.length === 0) {
      return NextResponse.json({ error: "Missing recipient address." }, { status: 400 });
    }

    // Resolve user from primary recipient
    const recipient = toRecipients[0];
    const user = await resolveUserForInboundEmail(recipient, from);
    if (!user) {
      console.warn(`[resend-inbound-webhook] No active user matching recipient: ${recipient}`);
      return NextResponse.json({
        received: true,
        message: "Recipient not recognized or inbound forwarding disabled for user.",
      });
    }

    // Process raw attachments
    const rawAttachments = Array.isArray(data.attachments)
      ? (data.attachments as Array<Record<string, unknown>>)
      : [];
    const parsedAttachments: InboundEmailAttachmentInput[] = [];

    for (const att of rawAttachments) {
      const filename = (att.filename as string) || "document.pdf";
      const mimeType =
        (att.content_type as string) || (att.mimeType as string) || "application/pdf";

      let dataBuffer: Buffer | null = null;
      if (typeof att.content === "string") {
        dataBuffer = Buffer.from(att.content, "base64");
      } else if (typeof att.download_url === "string") {
        try {
          const res = await fetch(att.download_url);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            dataBuffer = Buffer.from(arrayBuffer);
          }
        } catch (fetchErr) {
          console.error(
            `[resend-inbound-webhook] Failed downloading attachment ${filename}:`,
            fetchErr,
          );
        }
      }

      if (dataBuffer && dataBuffer.length > 0 && dataBuffer.length <= 25 * 1024 * 1024) {
        parsedAttachments.push({
          filename,
          mimeType,
          data: dataBuffer,
        });
      }
    }

    const result = await processInboundEmail({
      userId: user.id,
      from: cleanAddress(from),
      to: recipient,
      subject,
      textBody,
      htmlBody,
      messageId: emailId,
      receivedAt: new Date(),
      attachments: parsedAttachments,
    });

    return NextResponse.json({
      received: true,
      status: "PROCESSED",
      result,
    });
  } catch (error) {
    console.error("[resend-inbound-webhook] Processing error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

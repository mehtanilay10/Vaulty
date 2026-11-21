import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";

function getWebhookSecret(): string {
  const secret = process.env.GOOGLE_DRIVE_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("GOOGLE_DRIVE_WEBHOOK_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function verifyWebhookSignature(signature: string | null, body: string): boolean {
  if (!signature) return false;
  try {
    const expected = createHmac("sha256", getWebhookSecret()).update(body).digest("hex");
    let supplied = signature;
    if (signature.startsWith("sha256=")) {
      supplied = signature.slice(7);
    }
    const suppliedBuf = Buffer.from(supplied);
    const expectedBuf = Buffer.from(expected);
    if (suppliedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(suppliedBuf, expectedBuf);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-hub-signature-256") || req.headers.get("x-hub-signature");
    const rawBody = await req.text();

    if (!verifyWebhookSignature(signature, rawBody)) {
      console.error("Google Drive webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const channelId = (body?.id as string | undefined) || (body?.channelId as string | undefined);
    if (!channelId) {
      return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    }

    const connection = await prisma.storageConnection.findFirst({
      where: {
        channelId,
        provider: "GOOGLE_DRIVE",
      },
    });

    if (!connection) {
      return NextResponse.json({ received: true, message: "Channel not found, ignored." });
    }

    await prisma.storageConnection.update({
      where: { id: connection.id },
      data: {
        status: StorageConnectionStatus.PENDING,
      },
    });

    return NextResponse.json({ received: true, message: "Sync marked as pending." });
  } catch (error) {
    console.error("Google Drive webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    try {
      const secret = getWebhookSecret();
      const tokenBuf = Buffer.from(token);
      const secretBuf = Buffer.from(secret);
      if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
        console.error("Google Drive webhook verification token mismatch");
        return NextResponse.json({ error: "Invalid verification token." }, { status: 403 });
      }
      return new NextResponse(challenge, { status: 200 });
    } catch {
      return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
}

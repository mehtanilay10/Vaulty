import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const channelId = body?.id || body?.channelId;
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
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
}

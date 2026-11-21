import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await prisma.storageConnection.findFirst({
      where: {
        userId: user.id,
        provider: "GOOGLE_DRIVE",
      },
      select: {
        id: true,
        status: true,
        rootFolderId: true,
        docsFolderId: true,
        summaryFolderId: true,
        textFolderId: true,
        interpretationFolderId: true,
        lastSyncedAt: true,
        createdAt: true,
        updatedAt: true,
        channelId: true,
        channelExpiration: true,
        pageToken: true,
      },
    });

    return NextResponse.json(
      { connection },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("GET /api/integrations/google-drive/status error:", error);
    return NextResponse.json({ error: "Failed to fetch Drive status." }, { status: 500 });
  }
}

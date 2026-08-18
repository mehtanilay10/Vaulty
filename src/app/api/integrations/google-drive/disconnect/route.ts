import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.storageConnection.updateMany({
      where: {
        userId: user.id,
        provider: "GOOGLE_DRIVE",
      },
      data: {
        status: StorageConnectionStatus.DISCONNECTED,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        rootFolderId: null,
        docsFolderId: null,
        summaryFolderId: null,
        textFolderId: null,
        interpretationFolderId: null,
        pageToken: null,
        channelId: null,
        channelResourceId: null,
        channelExpiration: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/integrations/google-drive/disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect Google Drive." }, { status: 500 });
  }
}

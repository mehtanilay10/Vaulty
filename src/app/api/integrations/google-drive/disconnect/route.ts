import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";
import { revokeGoogleTokens } from "@/lib/google-drive/oauth";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { validateCSRFRequest } from "@/lib/csrf";

export async function DELETE(req: NextRequest) {
  try {
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current connection to revoke tokens before clearing
    const connection = await prisma.storageConnection.findFirst({
      where: {
        userId: user.id,
        provider: "GOOGLE_DRIVE",
      },
    });

    // Revoke the access token with Google if available
    if (connection?.accessToken) {
      await revokeGoogleTokens(connection.accessToken);
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

    await createAuditLog({
      userId: user.id,
      action: "GOOGLE_DRIVE_DISCONNECT",
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
      metadata: { hadAccessToken: !!connection?.accessToken },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/integrations/google-drive/disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect Google Drive." }, { status: 500 });
  }
}

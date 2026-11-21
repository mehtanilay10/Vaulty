import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [connection, pendingCount] = await Promise.all([
      prisma.outlookConnection.findUnique({
        where: { ownerId: user.id },
        select: {
          emailAddress: true,
          status: true,
          lastSyncedAt: true,
          connectedAt: true,
          syncPageToken: true,
        },
      }),
      prisma.emailTransactionImport.count({
        where: { ownerId: user.id, status: "PENDING", sourceProvider: "OUTLOOK" },
      }),
    ]);
    return NextResponse.json(
      {
        connected: connection?.status === "CONNECTED",
        connection: connection
          ? {
              emailAddress: connection.emailAddress,
              status: connection.status,
              lastSyncedAt: connection.lastSyncedAt,
              connectedAt: connection.connectedAt,
            }
          : null,
        hasMore: Boolean(connection?.syncPageToken),
        pendingCount,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("GET /api/integrations/outlook/status error:", error);
    return NextResponse.json({ error: "Failed to fetch Outlook status." }, { status: 500 });
  }
}

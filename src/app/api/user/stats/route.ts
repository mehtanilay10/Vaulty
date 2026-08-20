import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    const [totalFolders, totalDocuments, aiProcessed, aiPending, aiFailed] =
      await Promise.all([
        prisma.folder.count({ where: { ownerId: userId } }),
        prisma.document.count({ where: { ownerId: userId } }),
        prisma.aiProcessing.count({
          where: { document: { ownerId: userId }, status: "COMPLETED" },
        }),
        prisma.aiProcessing.count({
          where: {
            document: { ownerId: userId },
            status: { in: ["QUEUED", "PROCESSING"] },
          },
        }),
        prisma.aiProcessing.count({
          where: { document: { ownerId: userId }, status: "FAILED" },
        }),
      ]);

    return NextResponse.json({
      totalFolders,
      totalDocuments,
      aiProcessed,
      aiPending,
      aiFailed,
    });
  } catch (error) {
    console.error("GET /api/user/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats." }, { status: 500 });
  }
}

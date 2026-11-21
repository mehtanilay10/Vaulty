import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { timeoutStaleAiProcessing } from "@/lib/ai-timeout";
import { getWorkerStats } from "@/lib/ai/worker";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    await timeoutStaleAiProcessing(userId);

    const [
      totalFolders,
      totalDocuments,
      aiProcessed,
      aiQueued,
      aiProcessing,
      aiFailed,
      aiUnprocessed,
      workerStats,
    ] = await Promise.all([
      prisma.folder.count({ where: { ownerId: userId } }),
      prisma.document.count({ where: { ownerId: userId } }),
      prisma.aiProcessing.count({
        where: { document: { ownerId: userId }, status: "COMPLETED" },
      }),
      prisma.aiProcessing.count({
        where: {
          document: { ownerId: userId },
          status: { in: ["QUEUED"] },
        },
      }),
      prisma.aiProcessing.count({
        where: {
          document: { ownerId: userId },
          status: { in: ["PROCESSING"] },
        },
      }),
      prisma.aiProcessing.count({
        where: { document: { ownerId: userId }, status: "FAILED" },
      }),
      prisma.document.count({
        where: {
          ownerId: userId,
          aiProcessing: null,
        },
      }),
      getWorkerStats(),
    ]);

    return NextResponse.json({
      totalFolders,
      totalDocuments,
      aiProcessed,
      aiQueued,
      aiProcessing,
      aiFailed,
      aiUnprocessed,
      worker: workerStats,
    });
  } catch (error) {
    console.error("GET /api/user/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats." }, { status: 500 });
  }
}

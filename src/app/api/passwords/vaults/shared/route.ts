import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const shares = await prisma.vaultShare.findMany({
      where: { sharedWithId: user.id },
      include: {
        vault: {
          select: {
            id: true,
            userId: true,
            createdAt: true,
            _count: { select: { appCredentials: true, bankCredentials: true } },
          },
        },
        sharedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ shares });
  } catch (error) {
    console.error("GET shared vaults error:", error);
    return NextResponse.json({ error: "Failed to fetch shared vaults" }, { status: 500 });
  }
}

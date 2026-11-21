import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(now.getDate() + 90);

    const expiringDocuments = await prisma.document.findMany({
      where: {
        ownerId: user.id,
        expiryDate: {
          not: null,
          lte: ninetyDaysFromNow,
        },
      },
      orderBy: { expiryDate: "asc" },
      take: 5,
      select: {
        id: true,
        name: true,
        expiryDate: true,
        folder: { select: { id: true, name: true } },
      },
    });

    const docs = expiringDocuments.map((doc) => ({
      id: doc.id,
      name: doc.name,
      expiryDate: doc.expiryDate?.toISOString() || null,
      folder: doc.folder,
    }));

    return NextResponse.json({ documents: docs });
  } catch (error) {
    console.error("GET /api/documents/expiring error:", error);
    return NextResponse.json({ error: "Failed to fetch expiring documents." }, { status: 500 });
  }
}

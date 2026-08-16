import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";

    if (!query.trim() || query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } }, // Cannot share with self
          {
            OR: [
              { email: { contains: query.trim(), mode: "insensitive" } },
              { name: { contains: query.trim(), mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
      take: 10,
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/users/search error:", error);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}

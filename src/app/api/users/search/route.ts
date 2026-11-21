import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { consumeSecurityAttempt } from "@/lib/security-rate-limit";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await consumeSecurityAttempt({
      key: `user-search:${user.id}`,
      limit: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many search requests. Please try again later." },
        { status: 429 },
      );
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";

    if (!query.trim() || query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } },
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
      take: 5,
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/users/search error:", error);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}

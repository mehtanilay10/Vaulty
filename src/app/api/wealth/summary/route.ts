import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateWealthSummary, getUpcomingReminders } from "@/lib/wealth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await prisma.wealthAccount.findMany({
      where: { ownerId: user.id, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        type: true,
        currentBalance: true,
        currency: true,
        creditLimit: true,
        category: true,
        dueDate: true,
        expiryDate: true,
      },
    });

    const { summary, breakdown, currency } = calculateWealthSummary(accounts);

    const recentTransactions = await prisma.wealthTransaction.findMany({
      where: {
        account: { ownerId: user.id },
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { date: "desc" },
      take: 10,
    });

    const upcomingReminders = getUpcomingReminders(accounts);

    return NextResponse.json({
      summary: { ...summary, currency },
      breakdown,
      recentTransactions,
      upcomingReminders,
    });
  } catch (error) {
    console.error("GET /api/wealth/summary error:", error);
    return NextResponse.json({ error: "Failed to fetch wealth summary." }, { status: 500 });
  }
}

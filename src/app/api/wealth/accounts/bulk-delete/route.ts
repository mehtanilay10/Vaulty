import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { validateCSRFRequest } from "@/lib/csrf";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createNotification, type NotificationType } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const body = await readJsonRecord(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const { accountIds } = body;
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return NextResponse.json({ error: "Account IDs array is required." }, { status: 400 });
    }

    // Verify all accounts belong to the user
    const accounts = await prisma.wealthAccount.findMany({
      where: {
        id: { in: accountIds },
        ownerId: user.id,
      },
      include: { _count: { select: { transactions: true } } },
    });

    if (accounts.length !== accountIds.length) {
      return NextResponse.json(
        { error: "One or more accounts not found or do not belong to you." },
        { status: 404 },
      );
    }

    const totalTransactions = accounts.reduce((sum, acc) => sum + acc._count.transactions, 0);

    // Delete all accounts in a transaction
    await prisma.$transaction(async (tx) => {
      // Unlink any email transaction imports pointing to these accounts
      await tx.emailTransactionImport.updateMany({
        where: { accountId: { in: accountIds } },
        data: { accountId: null },
      });

      // Delete accounts (transactions will be cascade deleted)
      await tx.wealthAccount.deleteMany({
        where: {
          id: { in: accountIds },
          ownerId: user.id,
        },
      });

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          action: "WEALTH_ACCOUNT_BULK_DELETE",
          userId: user.id,
          metadata: JSON.stringify({
            accountIds,
            accountNames: accounts.map((a) => a.name),
            transactionsDeleted: totalTransactions,
          }),
        },
      });
    });

    // Send notification
    await createNotification({
      userId: user.id,
      type: "WEALTH_ACCOUNT_DELETED" as NotificationType,
      title: "Accounts Deleted Successfully",
      message: `Deleted ${accounts.length} account(s) and ${totalTransactions} transaction(s).`,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${accounts.length} account(s) and ${totalTransactions} transaction(s).`,
      accountsDeleted: accounts.length,
      transactionsDeleted: totalTransactions,
    });
  } catch (error) {
    console.error("POST /api/wealth/accounts/bulk-delete error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

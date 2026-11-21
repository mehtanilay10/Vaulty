import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { validateCSRFRequest } from "@/lib/csrf";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBalanceDelta } from "@/lib/wealth";
import { createAuditLog } from "@/lib/audit-log";
import { createNotification, type NotificationType } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const { id: sourceAccountId } = await params;
    const body = await readJsonRecord(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const targetAccountId =
      typeof body.targetAccountId === "string" ? body.targetAccountId.trim() : "";
    if (!targetAccountId) {
      return NextResponse.json({ error: "Target account ID is required." }, { status: 400 });
    }

    if (sourceAccountId === targetAccountId) {
      return NextResponse.json({ error: "Cannot merge an account into itself." }, { status: 400 });
    }

    const [sourceAccount, targetAccount] = await Promise.all([
      prisma.wealthAccount.findFirst({
        where: { id: sourceAccountId, ownerId: user.id },
        include: { _count: { select: { transactions: true } } },
      }),
      prisma.wealthAccount.findFirst({
        where: { id: targetAccountId, ownerId: user.id },
        include: { _count: { select: { transactions: true } } },
      }),
    ]);

    if (!sourceAccount) {
      return NextResponse.json({ error: "Source account not found." }, { status: 404 });
    }

    if (!targetAccount) {
      return NextResponse.json({ error: "Target account not found." }, { status: 404 });
    }

    if (sourceAccount.currency !== targetAccount.currency) {
      return NextResponse.json(
        {
          error: `Cannot merge accounts with different currencies (${sourceAccount.currency} and ${targetAccount.currency}).`,
        },
        { status: 400 },
      );
    }

    const transactionCount = sourceAccount._count.transactions;

    await prisma.$transaction(async (tx) => {
      // 1. Reassign all email transaction imports to target account
      await tx.emailTransactionImport.updateMany({
        where: { accountId: sourceAccount.id },
        data: { accountId: targetAccount.id },
      });

      // 2. Compute opening base balances for both accounts before transactions
      const sourceTxs = await tx.wealthTransaction.findMany({
        where: { accountId: sourceAccount.id },
        select: { id: true, type: true, amount: true },
      });
      const targetTxs = await tx.wealthTransaction.findMany({
        where: { accountId: targetAccount.id },
        select: { id: true, type: true, amount: true },
      });

      const sourceDeltaSum = sourceTxs.reduce(
        (sum, t) => sum + getBalanceDelta(sourceAccount.type, t.type, Number(t.amount)),
        0,
      );
      const targetDeltaSum = targetTxs.reduce(
        (sum, t) => sum + getBalanceDelta(targetAccount.type, t.type, Number(t.amount)),
        0,
      );

      const sourceBaseBalance = Number(sourceAccount.currentBalance) - sourceDeltaSum;
      const targetBaseBalance = Number(targetAccount.currentBalance) - targetDeltaSum;
      const combinedBaseBalance = sourceBaseBalance + targetBaseBalance;

      // 3. Reassign all wealth transactions to target account
      if (transactionCount > 0) {
        await tx.wealthTransaction.updateMany({
          where: { accountId: sourceAccount.id },
          data: { accountId: targetAccount.id },
        });
      }

      // 4. Chronologically recalculate running balances for all merged transactions
      const allMergedTxs = await tx.wealthTransaction.findMany({
        where: { accountId: targetAccount.id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });

      let running = combinedBaseBalance;
      for (const t of allMergedTxs) {
        running += getBalanceDelta(targetAccount.type, t.type, Number(t.amount));
        const newBalanceAfter = running.toFixed(2);
        if (Number(t.balanceAfter).toFixed(2) !== newBalanceAfter) {
          await tx.wealthTransaction.update({
            where: { id: t.id },
            data: { balanceAfter: newBalanceAfter },
          });
        }
      }

      // 5. Update target account balance to the verified merged running balance
      await tx.wealthAccount.update({
        where: { id: targetAccount.id },
        data: { currentBalance: running.toFixed(2) },
      });

      // 6. Safely delete the source account
      await tx.wealthAccount.delete({
        where: { id: sourceAccount.id },
      });
    });

    // 5. Audit log
    await createAuditLog({
      userId: user.id,
      action: "WEALTH_ACCOUNT_MERGE",
      metadata: {
        sourceAccountId: sourceAccount.id,
        targetAccountId: targetAccount.id,
        sourceName: sourceAccount.name,
        targetName: targetAccount.name,
        transactionsTransferred: transactionCount,
      },
    });

    // 6. In-app notification
    await createNotification({
      userId: user.id,
      type: "WEALTH_ACCOUNT_MERGED" as NotificationType,
      title: "Accounts Merged Successfully",
      message: `Merged "${sourceAccount.name}" into "${targetAccount.name}". ${transactionCount} transaction(s) were transferred.`,
      actionUrl: `/wealth/accounts/${targetAccount.id}`,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully merged "${sourceAccount.name}" into "${targetAccount.name}".`,
      targetAccountId: targetAccount.id,
      transactionsTransferred: transactionCount,
    });
  } catch (error) {
    console.error("POST /api/wealth/accounts/[id]/merge error:", error);
    const message = error instanceof Error ? error.message : "Failed to merge accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

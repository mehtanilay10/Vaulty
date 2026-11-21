import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import {
  WEALTH_TRANSACTION_TYPES,
  getBalanceDelta,
  getStoredTransactionAmount,
  normalizeCurrency,
  normalizeOptionalString,
  normalizeStringArray,
  parseOptionalDate,
  parseOptionalNumber,
} from "@/lib/wealth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; transactionId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, transactionId } = await params;

    const transaction = await prisma.wealthTransaction.findFirst({
      where: {
        id: transactionId,
        accountId: id,
        account: { ownerId: user.id },
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error("GET /api/wealth/accounts/[id]/transactions/[transactionId] error:", error);
    return NextResponse.json({ error: "Failed to fetch transaction." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; transactionId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const { id, transactionId } = await params;
    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });

    if (body.type !== undefined && !WEALTH_TRANSACTION_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "Invalid transaction type." }, { status: 400 });
    }

    const amount = body.amount !== undefined ? parseOptionalNumber(body.amount) : null;

    if (body.description !== undefined && !normalizeOptionalString(body.description)) {
      return NextResponse.json({ error: "Description cannot be empty." }, { status: 400 });
    }

    const transactionDate = body.date !== undefined ? parseOptionalDate(body.date) : null;

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.wealthAccount.findFirst({
        where: { id, ownerId: user.id },
      });

      if (!account) {
        throw new Error("Account not found.");
      }

      const existingTransaction = await tx.wealthTransaction.findFirst({
        where: { id: transactionId, accountId: id },
      });

      if (!existingTransaction) {
        throw new Error("Transaction not found.");
      }

      const type = body.type ?? existingTransaction.type;
      const parsedAmount = amount !== null ? amount : Number(existingTransaction.amount);

      if (parsedAmount === 0) {
        throw new Error("Amount must be a non-zero number.");
      }

      if (!transactionDate && body.date !== undefined) {
        throw new Error("Invalid transaction date.");
      }

      const finalDate = transactionDate ?? existingTransaction.date;
      const storedAmount = getStoredTransactionAmount(type, parsedAmount);

      const earliestTx = await tx.wealthTransaction.findFirst({
        where: { accountId: id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });

      if (!earliestTx) {
        throw new Error("Transaction not found.");
      }

      const baseBalance =
        Number(earliestTx.balanceAfter) -
        getBalanceDelta(account.type, earliestTx.type, Number(earliestTx.amount));

      const units = body.units !== undefined ? parseOptionalNumber(body.units) : undefined;
      const navPrice = body.navPrice !== undefined ? parseOptionalNumber(body.navPrice) : undefined;

      await tx.wealthTransaction.update({
        where: { id: transactionId },
        data: {
          ...(body.type !== undefined && { type }),
          ...((body.amount !== undefined || body.type !== undefined) && {
            amount: storedAmount.toFixed(2),
          }),
          ...(body.currency !== undefined && {
            currency: normalizeCurrency(body.currency),
          }),
          ...(body.description !== undefined && {
            description: normalizeOptionalString(body.description) as string,
          }),
          ...(body.referenceNumber !== undefined && {
            referenceNumber: normalizeOptionalString(body.referenceNumber),
          }),
          ...(body.date !== undefined && { date: finalDate }),
          ...(body.category !== undefined && {
            category: normalizeOptionalString(body.category),
          }),
          ...(body.subcategory !== undefined && {
            subcategory: normalizeOptionalString(body.subcategory),
          }),
          ...(body.units !== undefined && {
            units: units === null ? null : units?.toFixed(4),
          }),
          ...(body.navPrice !== undefined && {
            navPrice: navPrice === null ? null : navPrice?.toFixed(4),
          }),
          ...(body.notes !== undefined && {
            notes: normalizeOptionalString(body.notes),
          }),
          ...(body.attachments !== undefined && {
            attachments: normalizeStringArray(body.attachments),
          }),
        },
      });

      const allTransactions = await tx.wealthTransaction.findMany({
        where: { accountId: id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });

      let runningBalance = baseBalance;
      let targetTransaction = null;

      for (const txItem of allTransactions) {
        const delta = getBalanceDelta(account.type, txItem.type, Number(txItem.amount));
        runningBalance += delta;
        const newBalanceAfter = runningBalance.toFixed(2);

        if (Number(txItem.balanceAfter).toFixed(2) !== newBalanceAfter) {
          const updated = await tx.wealthTransaction.update({
            where: { id: txItem.id },
            data: { balanceAfter: newBalanceAfter },
          });
          if (txItem.id === transactionId) {
            targetTransaction = updated;
          }
        } else if (txItem.id === transactionId) {
          targetTransaction = txItem;
        }
      }

      await tx.wealthAccount.update({
        where: { id },
        data: { currentBalance: runningBalance.toFixed(2) },
      });

      await tx.auditLog.create({
        data: {
          action: "WEALTH_TRANSACTION_UPDATE",
          userId: user.id,
          metadata: JSON.stringify({
            transactionId,
            accountId: id,
          }),
        },
      });

      return targetTransaction;
    });

    return NextResponse.json({ transaction: result });
  } catch (error) {
    console.error("PATCH /api/wealth/accounts/[id]/transactions/[transactionId] error:", error);
    const message = error instanceof Error ? error.message : "Failed to update transaction.";
    const status =
      message === "Transaction not found." || message === "Account not found."
        ? 404
        : message === "Amount must be a non-zero number."
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; transactionId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const { id, transactionId } = await params;

    await prisma.$transaction(async (tx) => {
      const account = await tx.wealthAccount.findFirst({
        where: { id, ownerId: user.id },
      });

      if (!account) {
        throw new Error("Account not found.");
      }

      const existingTransaction = await tx.wealthTransaction.findFirst({
        where: { id: transactionId, accountId: id },
      });

      if (!existingTransaction) {
        throw new Error("Transaction not found.");
      }

      const earliestTx = await tx.wealthTransaction.findFirst({
        where: { accountId: id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });

      if (!earliestTx) {
        throw new Error("Transaction not found.");
      }

      const baseBalance =
        Number(earliestTx.balanceAfter) -
        getBalanceDelta(account.type, earliestTx.type, Number(earliestTx.amount));

      await tx.wealthTransaction.delete({
        where: { id: transactionId },
      });

      const remainingTransactions = await tx.wealthTransaction.findMany({
        where: { accountId: id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });

      let runningBalance = baseBalance;
      for (const txItem of remainingTransactions) {
        const delta = getBalanceDelta(account.type, txItem.type, Number(txItem.amount));
        runningBalance += delta;
        const newBalanceAfter = runningBalance.toFixed(2);

        if (Number(txItem.balanceAfter).toFixed(2) !== newBalanceAfter) {
          await tx.wealthTransaction.update({
            where: { id: txItem.id },
            data: { balanceAfter: newBalanceAfter },
          });
        }
      }

      await tx.wealthAccount.update({
        where: { id },
        data: { currentBalance: runningBalance.toFixed(2) },
      });

      await tx.auditLog.create({
        data: {
          action: "WEALTH_TRANSACTION_DELETE",
          userId: user.id,
          metadata: JSON.stringify({
            transactionId,
            accountId: id,
          }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/wealth/accounts/[id]/transactions/[transactionId] error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete transaction.";
    const status =
      message === "Transaction not found." || message === "Account not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

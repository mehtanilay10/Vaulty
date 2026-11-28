import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { TransactionType } from "@prisma/client";
import { getBalanceDelta, getStoredTransactionAmount } from "@/lib/wealth";
import { removeDuplicateTransactions } from "@/lib/gmail/dedupe-transactions";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { validateCSRFRequest } from "@/lib/csrf";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.statementsImport,
    });
    if (rateLimited) return rateLimited;

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const { accountId, transactions } = body;

    if (!accountId) {
      return NextResponse.json({ error: "Account ID is required." }, { status: 400 });
    }

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: "Transactions array is required." }, { status: 400 });
    }

    // Verify account ownership
    const account = await prisma.wealthAccount.findFirst({
      where: { id: accountId, ownerId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Validate imported transactions before persisting.
    const WEALTH_TRANSACTION_TYPES = [
      "DEPOSIT",
      "WITHDRAWAL",
      "PURCHASE",
      "SALE",
      "INTEREST",
      "DIVIDEND",
      "FEE",
      "PAYMENT",
      "REFUND",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "ADJUSTMENT",
    ];
    for (const tx of transactions) {
      if (!tx || typeof tx !== "object") {
        return NextResponse.json({ error: "Invalid transaction payload." }, { status: 400 });
      }
      if (!WEALTH_TRANSACTION_TYPES.includes(tx.type)) {
        return NextResponse.json({ error: "Invalid transaction type." }, { status: 400 });
      }
      const amount = Number(tx.amount);
      if (!Number.isFinite(amount) || amount === 0) {
        return NextResponse.json({ error: "Amount must be a non-zero number." }, { status: 400 });
      }
      if (typeof tx.description !== "string" || !tx.description.trim()) {
        return NextResponse.json({ error: "Description is required." }, { status: 400 });
      }
      if (Number.isNaN(new Date(tx.date).getTime())) {
        return NextResponse.json({ error: "Invalid transaction date." }, { status: 400 });
      }
    }

    const normalizedTransactions = transactions as Array<{
      date: string | Date;
      description: string;
      amount: number | string;
      type: string;
      referenceNumber?: string | null;
    }>;
    const [savedTransactions, pendingEmailTransactions] = await Promise.all([
      prisma.wealthTransaction.findMany({
        where: { accountId },
        select: {
          amount: true,
          currency: true,
          type: true,
          date: true,
          referenceNumber: true,
          description: true,
        },
      }),
      prisma.emailTransactionImport.findMany({
        where: { ownerId: user.id, status: "PENDING", OR: [{ accountId }, { accountId: null }] },
        select: {
          amount: true,
          currency: true,
          type: true,
          date: true,
          referenceNumber: true,
          bankName: true,
          merchant: true,
          description: true,
        },
      }),
    ]);
    const uniqueTransactions = removeDuplicateTransactions(
      normalizedTransactions.map((item) => ({ ...item, currency: account.currency })),
      [...savedTransactions, ...pendingEmailTransactions],
    );

    // Import only genuinely new rows in one transaction. Email alerts already
    // pending review and transactions already saved are excluded here.
    const importedTransactions = await prisma.$transaction(async (dbTx) => {
      // Prevent concurrent deadlocks by acquiring an exclusive row lock on the parent account
      await dbTx.$executeRaw`SELECT 1 FROM "WealthAccount" WHERE "id" = ${accountId} FOR UPDATE`;

      // 1. Sort candidate statement transactions ascending by date so chronological running balances are correct
      const sortedTransactions = [...uniqueTransactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const existingEarliest = await dbTx.wealthTransaction.findFirst({
        where: { accountId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });

      const existingPreBalance = existingEarliest
        ? Number(existingEarliest.balanceAfter) -
          getBalanceDelta(account.type, existingEarliest.type, Number(existingEarliest.amount))
        : Number(account.currentBalance);

      // If imported transactions are older than existingEarliest, compute true starting anchor:
      let candidatePreDeltas = 0;
      if (existingEarliest) {
        const existingEarliestDate = new Date(existingEarliest.date).getTime();
        for (const t of sortedTransactions) {
          if (new Date(t.date).getTime() < existingEarliestDate) {
            candidatePreDeltas += getBalanceDelta(
              account.type,
              t.type as TransactionType,
              Number(t.amount),
            );
          }
        }
      }

      const baseBalance = existingPreBalance - candidatePreDeltas;

      const createdIds = new Set<string>();

      for (const transaction of sortedTransactions) {
        const { date, description, amount, type, referenceNumber } = transaction;
        const numericAmount = Number(amount);
        const storedAmount = getStoredTransactionAmount(type, numericAmount);

        const created = await dbTx.wealthTransaction.create({
          data: {
            accountId,
            type: type as TransactionType,
            amount: storedAmount.toFixed(2),
            currency: account.currency,
            description,
            referenceNumber,
            date: new Date(date),
            balanceAfter: "0.00",
          },
        });

        createdIds.add(created.id);
      }

      // 2. Chronologically calculate running balances across all transactions in the account
      const allTransactions = await dbTx.wealthTransaction.findMany({
        where: { accountId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });

      let running = baseBalance;
      const resultTransactions = [];

      for (const item of allTransactions) {
        const delta = getBalanceDelta(account.type, item.type, Number(item.amount));
        running += delta;
        const newBalanceAfter = running.toFixed(2);

        if (Number(item.balanceAfter).toFixed(2) !== newBalanceAfter) {
          const updated = await dbTx.wealthTransaction.update({
            where: { id: item.id },
            data: { balanceAfter: newBalanceAfter },
          });
          if (createdIds.has(item.id)) {
            resultTransactions.push(updated);
          }
        } else if (createdIds.has(item.id)) {
          resultTransactions.push(item);
        }
      }

      // 3. Update account balance to the final running balance
      await dbTx.wealthAccount.update({
        where: { id: accountId },
        data: {
          currentBalance: running.toFixed(2),
        },
      });

      return resultTransactions;
    });

    await createAuditLog({
      userId: user.id,
      action: "WEALTH_TRANSACTION_CREATE",
      accountId,
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
      metadata: {
        importedCount: importedTransactions.length,
        duplicatesSkipped: normalizedTransactions.length - uniqueTransactions.length,
        statementImport: true,
      },
    });

    return NextResponse.json({
      success: true,
      transactions: importedTransactions,
      count: importedTransactions.length,
      duplicatesSkipped: normalizedTransactions.length - uniqueTransactions.length,
    });
  } catch (error) {
    console.error("POST /api/wealth/statements/import error:", error);
    return NextResponse.json({ error: "Failed to import transactions." }, { status: 500 });
  }
}

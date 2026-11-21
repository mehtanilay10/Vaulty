import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import {
  WEALTH_ACCOUNT_TYPES,
  WEALTH_TRANSACTION_TYPES,
  getBalanceDelta,
  getStoredTransactionAmount,
  normalizeOptionalString,
  normalizeStringArray,
  parseOptionalDate,
  parseOptionalNumber,
} from "@/lib/wealth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const requestedLimit = Number(searchParams.get("limit") || "50");
    const requestedOffset = Number(searchParams.get("offset") || "0");
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.max(Math.trunc(requestedOffset), 0) : 0;

    const account = await prisma.wealthAccount.findFirst({
      where: { id, ownerId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (
      type &&
      !WEALTH_TRANSACTION_TYPES.includes(type as (typeof WEALTH_TRANSACTION_TYPES)[number])
    ) {
      return NextResponse.json({ error: "Invalid transaction type." }, { status: 400 });
    }

    const where: Record<string, unknown> = { accountId: id };
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      prisma.wealthTransaction.findMany({
        where,
        orderBy: { date: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.wealthTransaction.count({ where }),
    ]);

    return NextResponse.json({ transactions, total });
  } catch (error) {
    console.error("GET /api/wealth/accounts/[id]/transactions error:", error);
    return NextResponse.json({ error: "Failed to fetch transactions." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }
    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });

    const account = await prisma.wealthAccount.findFirst({
      where: { id, ownerId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (!WEALTH_ACCOUNT_TYPES.includes(account.type as (typeof WEALTH_ACCOUNT_TYPES)[number])) {
      return NextResponse.json({ error: "Account has an invalid type." }, { status: 400 });
    }

    const type = body.type;
    const amount = parseOptionalNumber(body.amount);
    const description = normalizeOptionalString(body.description);

    if (!WEALTH_TRANSACTION_TYPES.includes(type)) {
      return NextResponse.json({ error: "A valid transaction type is required." }, { status: 400 });
    }

    if (amount === null || amount === 0) {
      return NextResponse.json({ error: "Amount must be a non-zero number." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ error: "Description is required." }, { status: 400 });
    }

    const targetCurrency = body.currency ?? account.currency;
    if (typeof targetCurrency !== "string" || !/^[A-Za-z]{3}$/.test(targetCurrency.trim())) {
      return NextResponse.json(
        { error: "A valid 3-letter currency code is required." },
        { status: 400 },
      );
    }

    const transactionDate = body.date ? parseOptionalDate(body.date) : new Date();
    if (!transactionDate) {
      return NextResponse.json({ error: "Invalid transaction date." }, { status: 400 });
    }

    const storedAmount = getStoredTransactionAmount(type, amount);
    const units = parseOptionalNumber(body.units);
    const navPrice = parseOptionalNumber(body.navPrice);

    const result = await prisma.$transaction(async (tx) => {
      const latestAccount = await tx.wealthAccount.findFirst({
        where: { id, ownerId: user.id },
      });
      if (!latestAccount) {
        throw new Error("Account not found.");
      }
      if (
        !WEALTH_ACCOUNT_TYPES.includes(latestAccount.type as (typeof WEALTH_ACCOUNT_TYPES)[number])
      ) {
        throw new Error("Account has an invalid type.");
      }
      const currentBalance = Number(latestAccount.currentBalance);
      if (!Number.isFinite(currentBalance)) {
        throw new Error("Account current balance is invalid.");
      }
      const balanceDelta = getBalanceDelta(latestAccount.type, type, amount);
      const balanceAfter = currentBalance + balanceDelta;

      const txCurrency = (body.currency ?? latestAccount.currency)?.trim().toUpperCase();
      if (!txCurrency || !/^[A-Za-z]{3}$/.test(txCurrency)) {
        throw new Error("A valid 3-letter currency code is required.");
      }

      const transaction = await tx.wealthTransaction.create({
        data: {
          accountId: id,
          type,
          amount: storedAmount.toFixed(2),
          currency: txCurrency,
          description,
          referenceNumber: normalizeOptionalString(body.referenceNumber),
          date: transactionDate,
          balanceAfter: balanceAfter.toFixed(2),
          category: normalizeOptionalString(body.category),
          subcategory: normalizeOptionalString(body.subcategory),
          units: units === null ? null : units.toFixed(4),
          navPrice: navPrice === null ? null : navPrice.toFixed(4),
          notes: normalizeOptionalString(body.notes),
          attachments: normalizeStringArray(body.attachments),
        },
      });

      const updatedAccount = await tx.wealthAccount.update({
        where: { id },
        data: { currentBalance: balanceAfter.toFixed(2) },
      });

      await tx.auditLog.create({
        data: {
          action: "WEALTH_TRANSACTION_CREATE",
          userId: user.id,
          metadata: JSON.stringify({
            transactionId: transaction.id,
            accountId: id,
            type,
            amount: storedAmount,
          }),
        },
      });

      return { transaction, account: updatedAccount };
    });

    return NextResponse.json(
      {
        transaction: result.transaction,
        accountBalance: result.account.currentBalance,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/wealth/accounts/[id]/transactions error:", error);
    const message = error instanceof Error ? error.message : "Failed to create transaction.";
    if (message === "Account not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message === "Account has an invalid type." ||
      message === "Account current balance is invalid." ||
      message === "A valid 3-letter currency code is required."
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create transaction." }, { status: 500 });
  }
}

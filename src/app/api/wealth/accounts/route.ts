import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { Prisma } from "@prisma/client";
import type { WealthAccountType, WealthAccountStatus } from "@prisma/client";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/server-crypto";
import { validateCSRFRequest } from "@/lib/csrf";
import {
  WEALTH_ACCOUNT_STATUSES,
  WEALTH_ACCOUNT_TYPES,
  isValidAccountNumber,
  isValidCurrency,
  isValidInterestRate,
  isValidPin,
  isValidTenureMonths,
  normalizeCurrency,
  normalizeOptionalString,
  normalizeStringArray,
  parseNotifyDays,
  parseOptionalInteger,
  parseOptionalNumber,
  parseOptionalDate,
  validateDueDate,
  withoutPin,
} from "@/lib/wealth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const where: Prisma.WealthAccountWhereInput = {
      ownerId: user.id,
    };

    if (type) {
      if (!WEALTH_ACCOUNT_TYPES.includes(type as (typeof WEALTH_ACCOUNT_TYPES)[number])) {
        return NextResponse.json({ error: "Invalid account type." }, { status: 400 });
      }
      where.type = type as WealthAccountType;
    }

    if (status) {
      if (!WEALTH_ACCOUNT_STATUSES.includes(status as (typeof WEALTH_ACCOUNT_STATUSES)[number])) {
        return NextResponse.json({ error: "Invalid account status." }, { status: 400 });
      }
      where.status = status as WealthAccountStatus;
    }

    const accounts = await prisma.wealthAccount.findMany({
      where,
      include: {
        _count: { select: { transactions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ accounts: accounts.map(withoutPin) });
  } catch (error) {
    console.error("GET /api/wealth/accounts error:", error);
    return NextResponse.json({ error: "Failed to fetch accounts." }, { status: 500 });
  }
}

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
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const name = normalizeOptionalString(body.name);
    const type = body.type;
    const status = body.status ?? "ACTIVE";

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (!WEALTH_ACCOUNT_TYPES.includes(type)) {
      return NextResponse.json({ error: "A valid account type is required." }, { status: 400 });
    }

    if (!WEALTH_ACCOUNT_STATUSES.includes(status)) {
      return NextResponse.json({ error: "A valid account status is required." }, { status: 400 });
    }

    if (
      body.currentBalance !== undefined &&
      body.currentBalance !== null &&
      body.currentBalance !== ""
    ) {
      if (parseOptionalNumber(body.currentBalance) === null) {
        return NextResponse.json(
          { error: "Current balance must be a valid number." },
          { status: 400 },
        );
      }
    }
    if (body.creditLimit !== undefined && body.creditLimit !== null && body.creditLimit !== "") {
      const val = parseOptionalNumber(body.creditLimit);
      if (val === null || val < 0) {
        return NextResponse.json(
          { error: "Credit limit must be a valid non-negative number." },
          { status: 400 },
        );
      }
    }
    if (body.interestRate !== undefined && body.interestRate !== null && body.interestRate !== "") {
      const val = parseOptionalNumber(body.interestRate);
      if (val === null || !isValidInterestRate(val)) {
        return NextResponse.json(
          { error: "Interest rate must be between 0 and 100 percent." },
          { status: 400 },
        );
      }
    }
    if (body.emiAmount !== undefined && body.emiAmount !== null && body.emiAmount !== "") {
      const val = parseOptionalNumber(body.emiAmount);
      if (val === null || val < 0) {
        return NextResponse.json(
          { error: "EMI amount must be a valid non-negative number." },
          { status: 400 },
        );
      }
    }

    if (body.currency !== undefined && body.currency !== null && body.currency !== "") {
      if (!isValidCurrency(body.currency)) {
        return NextResponse.json(
          { error: "A valid 3-letter currency code is required." },
          { status: 400 },
        );
      }
    }

    if (body.tenureMonths !== undefined && body.tenureMonths !== null && body.tenureMonths !== "") {
      const val = parseOptionalInteger(body.tenureMonths);
      if (val === null || !isValidTenureMonths(val)) {
        return NextResponse.json(
          { error: "Tenure months must be an integer between 1 and 1200." },
          { status: 400 },
        );
      }
    }

    const accountNumber = normalizeOptionalString(body.accountNumber);
    if (accountNumber && !isValidAccountNumber(accountNumber)) {
      return NextResponse.json(
        {
          error:
            "Account number must be between 4 and 34 alphanumeric characters, spaces, or hyphens.",
        },
        { status: 400 },
      );
    }

    const currentBalance = parseOptionalNumber(body.currentBalance) ?? 0;
    const creditLimit = parseOptionalNumber(body.creditLimit);
    const interestRate = parseOptionalNumber(body.interestRate);
    const emiAmount = parseOptionalNumber(body.emiAmount);
    const tenureMonths = parseOptionalInteger(body.tenureMonths);
    const dueDate = parseOptionalInteger(body.dueDate);
    const pin = normalizeOptionalString(body.pin);
    const startDate = parseOptionalDate(body.startDate);

    if (pin && !isValidPin(pin)) {
      return NextResponse.json(
        { error: "PIN must be between 4 and 6 numeric digits." },
        { status: 400 },
      );
    }

    const dueDateValidation = validateDueDate(dueDate, startDate);
    if (!dueDateValidation.valid) {
      return NextResponse.json({ error: dueDateValidation.error }, { status: 400 });
    }

    // Hash PIN if provided
    const hashedPin = pin ? await hashPin(pin) : null;

    const account = await prisma.wealthAccount.create({
      data: {
        ownerId: user.id,
        name,
        type,
        status,
        accountNumber,
        bankName: normalizeOptionalString(body.bankName),
        branchName: normalizeOptionalString(body.branchName),
        currentBalance: currentBalance.toFixed(2),
        currency: normalizeCurrency(body.currency),
        creditLimit: creditLimit === null ? null : creditLimit.toFixed(2),
        billingCycle: normalizeOptionalString(body.billingCycle),
        dueDate,
        isin: normalizeOptionalString(body.isin),
        broker: normalizeOptionalString(body.broker),
        dematAccount: normalizeOptionalString(body.dematAccount),
        loanType: normalizeOptionalString(body.loanType),
        interestRate: interestRate === null ? null : interestRate.toFixed(2),
        emiAmount: emiAmount === null ? null : emiAmount.toFixed(2),
        tenureMonths,
        startDate: parseOptionalDate(body.startDate),
        endDate: parseOptionalDate(body.endDate),
        provider: normalizeOptionalString(body.provider),
        expiryDate: parseOptionalDate(body.expiryDate),
        pin: hashedPin,
        notes: normalizeOptionalString(body.notes),
        category: normalizeOptionalString(body.category),
        tags: normalizeStringArray(body.tags),
        paymentNotifyDaysBefore: parseNotifyDays(body.paymentNotifyDaysBefore),
        expiryNotifyDaysBefore: parseNotifyDays(body.expiryNotifyDaysBefore),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "WEALTH_ACCOUNT_CREATE",
        userId: user.id,
        metadata: JSON.stringify({ accountId: account.id, name: account.name, type: account.type }),
      },
    });

    return NextResponse.json({ account: withoutPin(account) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/wealth/accounts error:", error);
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}

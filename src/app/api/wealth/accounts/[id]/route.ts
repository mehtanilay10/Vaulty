import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { validateCSRFRequest } from "@/lib/csrf";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/server-crypto";
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
  parseOptionalDate,
  parseOptionalInteger,
  parseOptionalNumber,
  validateDueDate,
  withoutPin,
} from "@/lib/wealth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const account = await prisma.wealthAccount.findFirst({
      where: { id, ownerId: user.id },
      include: {
        transactions: {
          orderBy: { date: "desc" },
          take: 20,
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    return NextResponse.json({ account: withoutPin(account) });
  } catch (error) {
    console.error("GET /api/wealth/accounts/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch account." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const existingAccount = await prisma.wealthAccount.findFirst({
      where: { id, ownerId: user.id },
    });

    if (!existingAccount) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (body.name !== undefined && !normalizeOptionalString(body.name)) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }

    if (body.type !== undefined && !WEALTH_ACCOUNT_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "Invalid account type." }, { status: 400 });
    }

    if (body.status !== undefined && !WEALTH_ACCOUNT_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid account status." }, { status: 400 });
    }

    if (body.currentBalance !== undefined) {
      const currentBalance = parseOptionalNumber(body.currentBalance);
      if (currentBalance === null) {
        return NextResponse.json(
          { error: "Current balance must be a valid number." },
          { status: 400 },
        );
      }
    }

    if (body.creditLimit !== undefined && body.creditLimit !== null && body.creditLimit !== "") {
      const creditLimit = parseOptionalNumber(body.creditLimit);
      if (creditLimit === null || creditLimit < 0) {
        return NextResponse.json(
          { error: "Credit limit must be a valid non-negative number." },
          { status: 400 },
        );
      }
    }

    if (body.interestRate !== undefined && body.interestRate !== null && body.interestRate !== "") {
      const interestRate = parseOptionalNumber(body.interestRate);
      if (interestRate === null || !isValidInterestRate(interestRate)) {
        return NextResponse.json(
          { error: "Interest rate must be between 0 and 100 percent." },
          { status: 400 },
        );
      }
    }

    if (body.emiAmount !== undefined && body.emiAmount !== null && body.emiAmount !== "") {
      const emiAmount = parseOptionalNumber(body.emiAmount);
      if (emiAmount === null || emiAmount < 0) {
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
      const tenureMonths = parseOptionalInteger(body.tenureMonths);
      if (tenureMonths === null || !isValidTenureMonths(tenureMonths)) {
        return NextResponse.json(
          { error: "Tenure months must be an integer between 1 and 1200." },
          { status: 400 },
        );
      }
    }

    if (
      body.accountNumber !== undefined &&
      body.accountNumber !== null &&
      body.accountNumber !== ""
    ) {
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
    }

    if (body.dueDate !== undefined) {
      const dueDate = parseOptionalInteger(body.dueDate);
      const contextDate =
        body.startDate !== undefined
          ? parseOptionalDate(body.startDate)
          : existingAccount.startDate;
      const dueDateValidation = validateDueDate(dueDate, contextDate);
      if (!dueDateValidation.valid) {
        return NextResponse.json({ error: dueDateValidation.error }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {
      ...(body.name !== undefined && { name: normalizeOptionalString(body.name) }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.accountNumber !== undefined && {
        accountNumber: normalizeOptionalString(body.accountNumber),
      }),
      ...(body.bankName !== undefined && {
        bankName: normalizeOptionalString(body.bankName),
      }),
      ...(body.branchName !== undefined && {
        branchName: normalizeOptionalString(body.branchName),
      }),
      ...(body.currentBalance !== undefined && {
        currentBalance: parseOptionalNumber(body.currentBalance)!.toFixed(2),
      }),
      ...(body.currency !== undefined && { currency: normalizeCurrency(body.currency) }),
      ...(body.creditLimit !== undefined && {
        creditLimit:
          body.creditLimit === null || body.creditLimit === ""
            ? null
            : parseOptionalNumber(body.creditLimit)!.toFixed(2),
      }),
      ...(body.billingCycle !== undefined && {
        billingCycle: normalizeOptionalString(body.billingCycle),
      }),
      ...(body.dueDate !== undefined && { dueDate: parseOptionalInteger(body.dueDate) }),
      ...(body.isin !== undefined && { isin: normalizeOptionalString(body.isin) }),
      ...(body.broker !== undefined && { broker: normalizeOptionalString(body.broker) }),
      ...(body.dematAccount !== undefined && {
        dematAccount: normalizeOptionalString(body.dematAccount),
      }),
      ...(body.loanType !== undefined && {
        loanType: normalizeOptionalString(body.loanType),
      }),
      ...(body.interestRate !== undefined && {
        interestRate:
          body.interestRate === null || body.interestRate === ""
            ? null
            : parseOptionalNumber(body.interestRate)!.toFixed(2),
      }),
      ...(body.emiAmount !== undefined && {
        emiAmount:
          body.emiAmount === null || body.emiAmount === ""
            ? null
            : parseOptionalNumber(body.emiAmount)!.toFixed(2),
      }),
      ...(body.tenureMonths !== undefined && {
        tenureMonths: parseOptionalInteger(body.tenureMonths),
      }),
      ...(body.startDate !== undefined && {
        startDate: parseOptionalDate(body.startDate),
      }),
      ...(body.endDate !== undefined && {
        endDate: parseOptionalDate(body.endDate),
      }),
      ...(body.provider !== undefined && {
        provider: normalizeOptionalString(body.provider),
      }),
      ...(body.expiryDate !== undefined && {
        expiryDate: parseOptionalDate(body.expiryDate),
      }),
      ...(body.notes !== undefined && { notes: normalizeOptionalString(body.notes) }),
      ...(body.category !== undefined && {
        category: normalizeOptionalString(body.category),
      }),
      ...(body.tags !== undefined && { tags: normalizeStringArray(body.tags) }),
      ...(body.paymentNotifyDaysBefore !== undefined && {
        paymentNotifyDaysBefore: parseNotifyDays(body.paymentNotifyDaysBefore),
      }),
      ...(body.expiryNotifyDaysBefore !== undefined && {
        expiryNotifyDaysBefore: parseNotifyDays(body.expiryNotifyDaysBefore),
      }),
    };

    // Hash PIN if it's being updated
    if (body.pin !== undefined) {
      const pin = normalizeOptionalString(body.pin);
      if (pin && !isValidPin(pin)) {
        return NextResponse.json(
          { error: "PIN must be between 4 and 6 numeric digits." },
          { status: 400 },
        );
      }
      data.pin = pin ? await hashPin(pin) : null;
    }

    const updatedAccount = await prisma.$transaction(async (tx) => {
      // If currentBalance is modified and transactions exist, maintain the ledger chain
      // by inserting an ADJUSTMENT transaction for the discrepancy.
      if (body.currentBalance !== undefined) {
        const targetBalance = parseOptionalNumber(body.currentBalance);
        if (targetBalance !== null) {
          const currentBalanceNum = Number(existingAccount.currentBalance);
          const diff = Number((targetBalance - currentBalanceNum).toFixed(2));

          if (Math.abs(diff) > 0.001) {
            const txCount = await tx.wealthTransaction.count({ where: { accountId: id } });
            if (txCount > 0) {
              await tx.wealthTransaction.create({
                data: {
                  accountId: id,
                  type: "ADJUSTMENT",
                  amount: diff.toFixed(2),
                  currency: (data.currency as string) || existingAccount.currency,
                  description: "Manual balance adjustment",
                  date: new Date(),
                  balanceAfter: targetBalance.toFixed(2),
                  notes: `Manual balance adjustment from ${currentBalanceNum.toFixed(2)} to ${targetBalance.toFixed(2)}.`,
                },
              });
            }
          }
        }
      }

      const acc = await tx.wealthAccount.update({
        where: { id },
        data,
      });

      await tx.auditLog.create({
        data: {
          action: "WEALTH_ACCOUNT_UPDATE",
          userId: user.id,
          metadata: JSON.stringify({ accountId: acc.id, name: acc.name }),
        },
      });

      return acc;
    });

    return NextResponse.json({ account: withoutPin(updatedAccount) });
  } catch (error) {
    console.error("PATCH /api/wealth/accounts/[id] error:", error);
    return NextResponse.json({ error: "Failed to update account." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const existingAccount = await prisma.wealthAccount.findFirst({
      where: { id, ownerId: user.id },
    });

    if (!existingAccount) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.emailTransactionImport.updateMany({
        where: { accountId: id },
        data: { accountId: null },
      }),
      prisma.wealthAccount.delete({
        where: { id },
      }),
      prisma.auditLog.create({
        data: {
          action: "WEALTH_ACCOUNT_DELETE",
          userId: user.id,
          metadata: JSON.stringify({ accountId: id, name: existingAccount.name }),
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/wealth/accounts/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }
}

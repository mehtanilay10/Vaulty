import { describe, expect, it } from "vitest";
import { areDuplicateTransactions, removeDuplicateTransactions } from "./dedupe-transactions";

const base = {
  amount: 1250,
  currency: "INR",
  type: "PURCHASE",
  date: "2026-11-01T10:00:00.000Z",
  referenceNumber: "UTR-12345",
  bankName: "Example Bank",
  merchant: "Coffee Shop",
};

describe("financial transaction deduplication", () => {
  it("matches same reference, amount, currency, type and nearby date", () => {
    expect(areDuplicateTransactions(base, { ...base, date: "2026-11-02T09:00:00.000Z" })).toBe(
      true,
    );
  });

  it("does not merge different currencies or distant dates", () => {
    expect(areDuplicateTransactions(base, { ...base, currency: "USD" })).toBe(false);
    expect(areDuplicateTransactions(base, { ...base, date: "2026-11-10T10:00:00.000Z" })).toBe(
      false,
    );
  });

  it("matches statement descriptions that include a more detailed bank/merchant label", () => {
    const statementRow = {
      ...base,
      referenceNumber: null,
      type: "WITHDRAWAL",
      merchant: null,
      description: "COFFEE SHOP POS TERMINAL 04",
      bankName: "Example Bank Savings",
    };
    const emailAlert = {
      ...base,
      referenceNumber: null,
      type: "PURCHASE",
      description: "Coffee Shop",
      bankName: "Example Bank",
    };
    expect(areDuplicateTransactions(statementRow, emailAlert)).toBe(true);
  });

  it("removes duplicates against saved and pending transactions", () => {
    const candidates = [base, { ...base, referenceNumber: "UTR-12345", description: "duplicate" }];
    expect(removeDuplicateTransactions(candidates, [base])).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { parseTransactionEmail } from "./parse-transaction-email";

describe("parseTransactionEmail", () => {
  const receivedAt = new Date("2026-11-05T10:00:00.000Z");

  it("detects an Indian bank debit alert and its UTR", () => {
    const result = parseTransactionEmail({
      subject: "HDFC Bank: Account transaction alert",
      from: "HDFC Bank <alerts@hdfcbank.net>",
      body: "Your account XX1234 has been debited by INR 1,250.50 at AMAZON on 05-Nov. UPI Ref No 123456789012.",
      receivedAt,
    });

    expect(result).toMatchObject({
      amount: 1250.5,
      currency: "INR",
      type: "WITHDRAWAL",
      bankName: "HDFC Bank",
      referenceNumber: "123456789012",
    });
  });

  it("detects a credit alert", () => {
    const result = parseTransactionEmail({
      subject: "Salary credited",
      from: "alerts@bank.example",
      body: "Your account has been credited with Rs. 75,000.00 on 30-Oct.",
      receivedAt,
    });

    expect(result).toMatchObject({ amount: 75000, currency: "INR", type: "DEPOSIT" });
  });

  it("does not label generic account wording as a merchant", () => {
    const result = parseTransactionEmail({
      subject: "Salary credited",
      from: "alerts@bank.example",
      body: "Your account has been credited with Rs. 75,000.00 as salary.",
      receivedAt,
    });

    expect(result).toMatchObject({ type: "DEPOSIT", merchant: null });
  });

  it("does not treat general emails without a transaction direction as transactions", () => {
    const result = parseTransactionEmail({
      subject: "Your monthly account statement is ready",
      from: "statements@bank.example",
      body: "Your closing balance is INR 18,500.00.",
      receivedAt,
    });

    expect(result).toBeNull();
  });
});

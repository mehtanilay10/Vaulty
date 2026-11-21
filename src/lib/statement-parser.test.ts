import { describe, expect, it } from "vitest";
import { parseCSVStatement, parseCsvRows, parseTextStatement } from "@/lib/statement-parser";

describe("statement parser date formats", () => {
  it("interprets slash-separated statement dates as day-first and normalizes to UTC midnight", () => {
    const result = parseCSVStatement("Date,Description,Amount\n01/02/2026,Salary,1200.00");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].date.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("extracts text statement rows with named month dates and INR symbols normalized to UTC midnight", () => {
    const result = parseTextStatement("01 Feb 2026 UPI AMAZON ₹1,250.00");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(1250);
    expect(result.transactions[0].type).toBe("WITHDRAWAL");
    expect(result.transactions[0].date.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("RFC 4180 CSV parsing", () => {
  it("handles commas within quoted fields", () => {
    const csv = 'Date,Description,Amount\n2026-03-01,"Coffee, tea, and bakery",-15.50';
    const result = parseCSVStatement(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Coffee, tea, and bakery");
    expect(result.transactions[0].amount).toBe(15.5);
    expect(result.transactions[0].type).toBe("WITHDRAWAL");
  });

  it("handles escaped quotes within quoted fields", () => {
    const csv = 'Date,Description,Amount\n2026-03-02,"Payment for ""Services""",500.00';
    const result = parseCSVStatement(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe('Payment for "Services"');
    expect(result.transactions[0].amount).toBe(500);
    expect(result.transactions[0].type).toBe("DEPOSIT");
  });

  it("handles multiline quoted fields per RFC 4180", () => {
    const csv = 'Date,Description,Amount\n2026-03-03,"Line 1\nLine 2",100.00';
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("Line 1\nLine 2");
  });

  it("parses multi-column bank statements with separate Debit and Credit columns", () => {
    const csv = [
      "Txn Date,Narration,Chq/Ref No,Withdrawal,Deposit,Balance",
      "2026-04-01,Electricity Bill,REF1001,850.50,,15000.00",
      "2026-04-02,Client Payment,REF1002,,25000.00,40000.00",
    ].join("\n");
    const result = parseCSVStatement(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].description).toBe("Electricity Bill");
    expect(result.transactions[0].amount).toBe(850.5);
    expect(result.transactions[0].type).toBe("WITHDRAWAL");
    expect(result.transactions[0].referenceNumber).toBe("REF1001");
    expect(result.transactions[1].description).toBe("Client Payment");
    expect(result.transactions[1].amount).toBe(25000);
    expect(result.transactions[1].type).toBe("DEPOSIT");
    expect(result.transactions[1].referenceNumber).toBe("REF1002");
    expect(result.summary.totalWithdrawals).toBe(850.5);
    expect(result.summary.totalDeposits).toBe(25000);
  });
});

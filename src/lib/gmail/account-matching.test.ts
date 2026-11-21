import { describe, expect, it } from "vitest";
import {
  extractAccountLastFour,
  extractAccountNumberHint,
  matchFinancialAccount,
} from "./account-matching";

describe("email account hints", () => {
  it("extracts a last-four hint from common alert formats", () => {
    expect(extractAccountLastFour("Your A/c XX1234 was debited")).toBe("1234");
    expect(extractAccountLastFour("Card ending 9876 was used")).toBe("9876");
    expect(extractAccountNumberHint("Your account number 001234567890 was debited")).toBe(
      "001234567890",
    );
  });

  it("preselects only a unique bank and account-number match", () => {
    const accounts = [
      { id: "a", name: "Savings", bankName: "HDFC Bank", accountNumber: "001234" },
      { id: "b", name: "Credit Card", bankName: "HDFC Bank", accountNumber: "998877" },
    ];
    expect(matchFinancialAccount(accounts, "HDFC Bank", "1234")).toBe("a");
    expect(matchFinancialAccount(accounts, "HDFC Bank", null, "001234")).toBe("a");
    expect(matchFinancialAccount(accounts, "HDFC Bank", null)).toBeNull();
    expect(matchFinancialAccount(accounts, "Unknown Bank", "1234")).toBeNull();
  });
});

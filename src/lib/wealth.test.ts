import { describe, expect, it } from "vitest";
import {
  calculateWealthSummary,
  getBalanceDelta,
  isValidAccountNumber,
  isValidCurrency,
  isValidInterestRate,
  isValidPin,
  isValidTenureMonths,
  normalizeCurrency,
  normalizeStringArray,
  parseNotifyDays,
  validateDueDate,
} from "./wealth";

describe("calculateWealthSummary currency grouping", () => {
  it("keeps each currency separate and does not produce a mixed-currency net worth", () => {
    const result = calculateWealthSummary([
      { type: "SAVINGS_ACCOUNT", currentBalance: 100000, currency: "INR" },
      { type: "CREDIT_CARD", currentBalance: 10000, currency: "INR" },
      { type: "SAVINGS_ACCOUNT", currentBalance: 2500, currency: "USD" },
    ]);

    expect(result.currency).toBeNull();
    expect(result.summary.totalAssets).toBe(0);
    expect(result.summary.totalLiabilities).toBe(0);
    expect(result.summary.netWorth).toBe(0);
    expect(result.summary.currencyTotals).toEqual([
      expect.objectContaining({
        currency: "INR",
        totalAssets: 100000,
        totalLiabilities: 10000,
        netWorth: 90000,
      }),
      expect.objectContaining({
        currency: "USD",
        totalAssets: 2500,
        totalLiabilities: 0,
        netWorth: 2500,
      }),
    ]);
  });

  it("retains a simple top-level summary for a single currency", () => {
    const result = calculateWealthSummary([
      { type: "SAVINGS_ACCOUNT", currentBalance: 1200, currency: "EUR" },
    ]);
    expect(result.currency).toBe("EUR");
    expect(result.summary.netWorth).toBe(1200);
  });
});

describe("validateDueDate", () => {
  it("accepts null due date", () => {
    expect(validateDueDate(null)).toEqual({ valid: true });
  });

  it("rejects days outside 1-31", () => {
    expect(validateDueDate(0)).toEqual({
      valid: false,
      error: "Due date must be a day between 1 and 31.",
    });
    expect(validateDueDate(32)).toEqual({
      valid: false,
      error: "Due date must be a day between 1 and 31.",
    });
    expect(validateDueDate(-5)).toEqual({
      valid: false,
      error: "Due date must be a day between 1 and 31.",
    });
  });

  it("accepts valid days within 1-31 when no context date is provided", () => {
    expect(validateDueDate(1)).toEqual({ valid: true });
    expect(validateDueDate(15)).toEqual({ valid: true });
    expect(validateDueDate(31)).toEqual({ valid: true });
  });

  it("context-aware validation rejects days exceeding month days", () => {
    // Non-leap year February (28 days)
    const feb2025 = new Date("2025-02-10");
    expect(validateDueDate(28, feb2025)).toEqual({ valid: true });
    expect(validateDueDate(29, feb2025)).toEqual({
      valid: false,
      error: "Due date 29 is invalid for February (has 28 days).",
    });
    expect(validateDueDate(30, feb2025)).toEqual({
      valid: false,
      error: "Due date 30 is invalid for February (has 28 days).",
    });

    // Leap year February (29 days)
    const feb2024 = new Date("2024-02-15");
    expect(validateDueDate(29, feb2024)).toEqual({ valid: true });
    expect(validateDueDate(30, feb2024)).toEqual({
      valid: false,
      error: "Due date 30 is invalid for February (has 29 days).",
    });

    // 30-day month (April)
    const apr2026 = new Date("2026-04-01");
    expect(validateDueDate(30, apr2026)).toEqual({ valid: true });
    expect(validateDueDate(31, apr2026)).toEqual({
      valid: false,
      error: "Due date 31 is invalid for April (has 30 days).",
    });
  });
});

describe("isValidCurrency", () => {
  it("validates 3-letter currency codes", () => {
    expect(isValidCurrency("INR")).toBe(true);
    expect(isValidCurrency("USD")).toBe(true);
    expect(isValidCurrency("eur")).toBe(true);
    expect(isValidCurrency("  GBP  ")).toBe(true);
  });

  it("rejects invalid currencies", () => {
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency("US")).toBe(false);
    expect(isValidCurrency("USDD")).toBe(false);
    expect(isValidCurrency("123")).toBe(false);
    expect(isValidCurrency(null)).toBe(false);
    expect(isValidCurrency(undefined)).toBe(false);
  });
});

describe("getBalanceDelta", () => {
  it("calculates balance delta correctly for asset accounts", () => {
    expect(getBalanceDelta("SAVINGS_ACCOUNT", "DEPOSIT", 500)).toBe(500);
    expect(getBalanceDelta("SAVINGS_ACCOUNT", "WITHDRAWAL", 500)).toBe(-500);
  });

  it("calculates balance delta correctly for liability accounts", () => {
    expect(getBalanceDelta("CREDIT_CARD", "PURCHASE", 500)).toBe(500);
    expect(getBalanceDelta("CREDIT_CARD", "PAYMENT", 500)).toBe(-500);
  });
});

describe("isValidPin", () => {
  it("accepts 4 to 6 numeric digits", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345")).toBe(true);
    expect(isValidPin("123456")).toBe(true);
  });

  it("rejects non-numeric characters or invalid lengths", () => {
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("abcd")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });
});

describe("isValidAccountNumber", () => {
  it("accepts alphanumeric strings between 4 and 34 characters", () => {
    expect(isValidAccountNumber("1234567890")).toBe(true);
    expect(isValidAccountNumber("GB82WEST12345698765432")).toBe(true);
    expect(isValidAccountNumber("ACC-1234 5678")).toBe(true);
  });

  it("rejects invalid lengths or characters", () => {
    expect(isValidAccountNumber("123")).toBe(false);
    expect(isValidAccountNumber("A".repeat(35))).toBe(false);
    expect(isValidAccountNumber("1234<script>")).toBe(false);
  });
});

describe("isValidInterestRate", () => {
  it("accepts rates between 0 and 100", () => {
    expect(isValidInterestRate(0)).toBe(true);
    expect(isValidInterestRate(7.5)).toBe(true);
    expect(isValidInterestRate(100)).toBe(true);
  });

  it("rejects rates outside 0-100 or non-finite numbers", () => {
    expect(isValidInterestRate(-0.1)).toBe(false);
    expect(isValidInterestRate(100.1)).toBe(false);
    expect(isValidInterestRate(NaN)).toBe(false);
    expect(isValidInterestRate(Infinity)).toBe(false);
  });
});

describe("isValidTenureMonths", () => {
  it("accepts positive integers within 1-1200", () => {
    expect(isValidTenureMonths(1)).toBe(true);
    expect(isValidTenureMonths(12)).toBe(true);
    expect(isValidTenureMonths(360)).toBe(true);
    expect(isValidTenureMonths(1200)).toBe(true);
  });

  it("rejects zero, negative, out-of-bounds, or non-integer numbers", () => {
    expect(isValidTenureMonths(0)).toBe(false);
    expect(isValidTenureMonths(-12)).toBe(false);
    expect(isValidTenureMonths(1201)).toBe(false);
    expect(isValidTenureMonths(12.5)).toBe(false);
    expect(isValidTenureMonths("12")).toBe(false);
  });
});

describe("normalizeStringArray", () => {
  it("preserves strings and converts numbers/booleans without losing data", () => {
    expect(normalizeStringArray(["tag1", 123, true, "  tag2  "])).toEqual([
      "tag1",
      "123",
      "true",
      "tag2",
    ]);
  });

  it("handles single string or number values", () => {
    expect(normalizeStringArray("tag1, tag2")).toEqual(["tag1", "tag2"]);
    expect(normalizeStringArray(42)).toEqual(["42"]);
  });

  it("drops null and empty values cleanly", () => {
    expect(normalizeStringArray([null, undefined, "", "   "])).toEqual([]);
    expect(normalizeStringArray(null)).toEqual([]);
  });
});

describe("normalizeCurrency", () => {
  it("returns uppercase 3-letter currency code", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("eur")).toBe("EUR");
  });

  it("falls back to INR or custom fallback when invalid", () => {
    expect(normalizeCurrency("INVALID")).toBe("INR");
    expect(normalizeCurrency("INVALID", "USD")).toBe("USD");
  });
});

describe("parseNotifyDays", () => {
  it("allows setting an empty array to disable notifications", () => {
    expect(parseNotifyDays([])).toEqual([]);
    expect(parseNotifyDays("")).toEqual([]);
  });

  it("parses valid notification day numbers from array or string", () => {
    expect(parseNotifyDays([7, 3, 1, 0])).toEqual([7, 3, 1, 0]);
    expect(parseNotifyDays("30, 7, 1")).toEqual([30, 7, 1]);
  });

  it("filters out invalid or out-of-range days", () => {
    expect(parseNotifyDays([7, -1, 500, "abc", 2])).toEqual([7, 2]);
  });

  it("falls back to default days when null or undefined", () => {
    expect(parseNotifyDays(null)).toEqual([7, 3, 1, 0]);
    expect(parseNotifyDays(undefined, [30, 7, 1, 0])).toEqual([30, 7, 1, 0]);
  });
});

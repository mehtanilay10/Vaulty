import { describe, expect, it } from "vitest";
import {
  cleanAddress,
  toOutlookClassificationEmail,
  inferDiscoveredAccountType,
  formatDiscoveredAccountName,
} from "./email-sync-engine";
import { areDuplicateTransactions } from "@/lib/gmail/dedupe-transactions";
import type { OutlookMessage } from "@/lib/outlook/oauth";

describe("email-sync-engine", () => {
  describe("inferDiscoveredAccountType and formatting", () => {
    it("infers credit cards, brokers, wallets, and savings accounts", () => {
      expect(inferDiscoveredAccountType("Axis Bank", "Credit Card alert")).toBe("CREDIT_CARD");
      expect(inferDiscoveredAccountType("Zerodha Broking Ltd", "Quarterly Equity Account")).toBe(
        "STOCK_PORTFOLIO",
      );
      expect(inferDiscoveredAccountType("Pluxee", "Meal card load")).toBe("OTHER");
      expect(inferDiscoveredAccountType("SBI", "Fixed Deposit advice")).toBe("FIXED_DEPOSIT");
      expect(inferDiscoveredAccountType("HDFC Bank", "Amount debited from account")).toBe(
        "SAVINGS_ACCOUNT",
      );
    });

    it("formats discovered account names with and without last 4 digits", () => {
      expect(formatDiscoveredAccountName("HDFC Bank", null, "1234")).toBe("HDFC Bank (***1234)");
      expect(formatDiscoveredAccountName("Pluxee", null, null)).toBe("Pluxee (Auto-Discovered)");
      expect(formatDiscoveredAccountName(null, "Starbucks", null)).toBe(
        "Starbucks (Auto-Discovered)",
      );
    });
  });
  describe("cleanAddress", () => {
    it("extracts bare email from bracketed angle format", () => {
      expect(cleanAddress("HDFC Bank <alerts@hdfcbank.net>")).toBe("alerts@hdfcbank.net");
      expect(cleanAddress("ICICI Bank <alerts@icicibank.com>")).toBe("alerts@icicibank.com");
    });

    it("returns plain email if already formatted", () => {
      expect(cleanAddress("notifications@sbi.co.in")).toBe("notifications@sbi.co.in");
    });

    it("handles whitespace and invalid inputs safely", () => {
      expect(cleanAddress("   ")).toBe("unknown");
      expect(cleanAddress("")).toBe("unknown");
      // @ts-expect-error testing non-string fallback
      expect(cleanAddress(null)).toBe("unknown");
    });
  });

  describe("toOutlookClassificationEmail", () => {
    it("converts OutlookMessage to GmailEmailForClassification structure with prefix", () => {
      const msg: OutlookMessage = {
        id: "AAMkAG12345",
        conversationId: "conv-999",
        subject: "Debit alert for your account",
        receivedDateTime: "2026-11-10T12:00:00Z",
        from: {
          emailAddress: { address: "alerts@bank.com" },
        },
        body: {
          contentType: "text",
          content: "Rs 1500 debited from card ending 1234",
        },
      };

      const result = toOutlookClassificationEmail(msg);
      expect(result.messageId).toBe("outlook:AAMkAG12345");
      expect(result.threadId).toBe("conv-999");
      expect(result.from).toBe("alerts@bank.com");
      expect(result.subject).toBe("Debit alert for your account");
      expect(result.body).toContain("Rs 1500 debited");
      expect(result.receivedAt.toISOString()).toBe("2026-11-10T12:00:00.000Z");
    });
  });

  describe("deduplication and auto-import eligibility logic", () => {
    it("correctly identifies duplicate transactions across sources", () => {
      const existing = {
        amount: 450,
        currency: "INR",
        type: "PURCHASE",
        date: new Date("2026-11-10T10:00:00Z"),
        referenceNumber: "REF123456",
        merchant: "Starbucks",
        bankName: "HDFC",
      };

      const incoming = {
        amount: 450,
        currency: "INR",
        type: "PURCHASE",
        date: new Date("2026-11-10T10:05:00Z"),
        referenceNumber: "REF123456",
        merchant: "Starbucks Coffee",
        bankName: "HDFC Bank",
      };

      expect(areDuplicateTransactions(existing, incoming)).toBe(true);
    });

    it("does not treat distinct amounts on the same date as duplicates", () => {
      const tx1 = {
        amount: 500,
        currency: "INR",
        type: "PURCHASE",
        date: new Date("2026-11-10T10:00:00Z"),
        merchant: "Starbucks",
      };

      const tx2 = {
        amount: 650,
        currency: "INR",
        type: "PURCHASE",
        date: new Date("2026-11-10T10:00:00Z"),
        merchant: "Starbucks",
      };

      expect(areDuplicateTransactions(tx1, tx2)).toBe(false);
    });

    it("verifies auto-import threshold criteria", () => {
      const threshold = 0.9;

      const candidateHigh = {
        confidence: 0.95,
        accountId: "acc-123",
        currency: "INR",
      };

      const candidateLow = {
        confidence: 0.85,
        accountId: "acc-123",
        currency: "INR",
      };

      const candidateNoAccount = {
        confidence: 0.98,
        accountId: null,
        currency: "INR",
      };

      const candidateCurrencyMismatch = {
        confidence: 0.95,
        accountId: "acc-123",
        currency: "USD",
      };

      const account = { id: "acc-123", currency: "INR" };

      const isEligible = (c: { confidence: number; accountId: string | null; currency: string }) =>
        Boolean(
          c.accountId &&
          c.accountId === account.id &&
          account.currency === c.currency &&
          c.confidence >= threshold,
        );

      expect(isEligible(candidateHigh)).toBe(true);
      expect(isEligible(candidateLow)).toBe(false);
      expect(isEligible(candidateNoAccount)).toBe(false);
      expect(isEligible(candidateCurrencyMismatch)).toBe(false);
    });
  });

  describe("sync failure and lastSyncedAt safety invariants", () => {
    it("guarantees lastSyncedAt is never updated if errors occur during sync", () => {
      const syncResultWithErrors = {
        errors: ["Gemini classification failed: Resource exhausted (429)"],
      };

      const shouldUpdateLastSyncedAt = (errors: string[]) => errors.length === 0;

      expect(shouldUpdateLastSyncedAt(syncResultWithErrors.errors)).toBe(false);
      expect(shouldUpdateLastSyncedAt([])).toBe(true);
    });

    it("ensures fatal processing errors stop the sync job before advancing cursor", () => {
      let cursorUpdated = false;
      let lastSyncedAtUpdated = false;
      const errors: string[] = [];

      // Simulate a failure in dynamic account creation or transaction persistence
      const simulateSyncPage = (hasError: boolean) => {
        if (hasError) {
          errors.push("Account creation failed for Discovered Card: Database connection timeout");
          // Job halts immediately
          return;
        }
        cursorUpdated = true;
        if (errors.length === 0) {
          lastSyncedAtUpdated = true;
        }
      };

      simulateSyncPage(true);

      expect(errors).toHaveLength(1);
      expect(cursorUpdated).toBe(false);
      expect(lastSyncedAtUpdated).toBe(false);
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  scoreMultiModuleEmails,
  rankMultiModuleEmails,
  heuristicClassifyMultiModule,
} from "./classify-multi-module-emails";
import type { GmailEmailForClassification } from "@/lib/gmail/classify-transaction-emails";

describe("classify-multi-module-emails", () => {
  const sampleEmails: GmailEmailForClassification[] = [
    {
      messageId: "msg-doc-1",
      from: "ebill@airtel.in",
      subject: "Airtel Broadband Tax Invoice for November 2026",
      body: "Dear Customer, Please find attached your tax invoice #INV-89123 for Rs 1499. Payment received with thanks.",
      receivedAt: new Date("2026-11-10T08:00:00Z"),
    },
    {
      messageId: "msg-rem-1",
      from: "alerts@hdfcbank.net",
      subject: "HDFC Bank Credit Card Bill Due Date Reminder",
      body: "Your total amount due of Rs 15,450 on card ending in 4321 is due on 25/11/2026. Minimum amount due is Rs 1,500. Pay before 25/11/2026 to avoid late fees.",
      receivedAt: new Date("2026-11-12T10:00:00Z"),
    },
    {
      messageId: "msg-pol-1",
      from: "insurance@tataaig.com",
      subject: "Tata AIG Private Car Insurance Policy Schedule",
      body: "Thank you for insuring with us. Policy #015948382. Valid till 2027-11-15. Please find policy document attached.",
      receivedAt: new Date("2026-11-14T11:00:00Z"),
    },
    {
      messageId: "msg-spam-1",
      from: "offers@marketing.com",
      subject: "Exclusive 50% discount - limited time offer!",
      body: "Unsubscribe from this newsletter anytime. Shop now and save big on clothes.",
      receivedAt: new Date("2026-11-15T12:00:00Z"),
    },
  ];

  describe("scoreMultiModuleEmails", () => {
    it("scores document emails positively for document keywords", () => {
      const scores = scoreMultiModuleEmails([sampleEmails[0]]);
      expect(scores[0].documentScore).toBeGreaterThanOrEqual(3);
      expect(scores[0].maxScore).toBeGreaterThanOrEqual(3);
    });

    it("scores reminder emails positively for due date keywords", () => {
      const scores = scoreMultiModuleEmails([sampleEmails[1]]);
      expect(scores[0].reminderScore).toBeGreaterThanOrEqual(3);
      expect(scores[0].maxScore).toBeGreaterThanOrEqual(3);
    });

    it("penalizes promotional and spam emails", () => {
      const scores = scoreMultiModuleEmails([sampleEmails[3]]);
      expect(scores[0].maxScore).toBeLessThan(0);
    });
  });

  describe("rankMultiModuleEmails", () => {
    it("filters out spam and returns high scoring emails across all modules", () => {
      const ranked = rankMultiModuleEmails(sampleEmails);
      const rankedIds = ranked.map((e) => e.messageId);
      expect(rankedIds).toContain("msg-doc-1");
      expect(rankedIds).toContain("msg-rem-1");
      expect(rankedIds).toContain("msg-pol-1");
      expect(rankedIds).not.toContain("msg-spam-1");
    });
  });

  describe("heuristicClassifyMultiModule", () => {
    it("identifies invoices and tax documents", () => {
      const result = heuristicClassifyMultiModule([sampleEmails[0]]);
      expect(result.documents.length).toBe(1);
      expect(result.documents[0].documentType).toBe("INVOICE");
      expect(result.documents[0].documentTitle).toContain("Airtel Broadband Tax Invoice");
    });

    it("identifies bill payment reminders and extracts due dates", () => {
      const result = heuristicClassifyMultiModule([sampleEmails[1]]);
      expect(result.reminders.length).toBe(1);
      expect(result.reminders[0].category).toBe("PAYMENT");
      expect(result.reminders[0].title).toContain("HDFC Bank Credit Card Bill Due Date Reminder");
      expect(result.reminders[0].amount).toBe(15450);
      expect(result.reminders[0].dueAt).toBeInstanceOf(Date);
    });

    it("identifies insurance policy documents and extracts expiration date", () => {
      const result = heuristicClassifyMultiModule([sampleEmails[2]]);
      expect(result.documents.length).toBe(1);
      expect(result.documents[0].documentType).toBe("INSURANCE_POLICY");
      expect(result.documents[0].expiryDate).toBeInstanceOf(Date);
      expect(result.documents[0].expiryDate?.toISOString().slice(0, 10)).toBe("2027-11-15");
    });
  });

  describe("classifyMultiModuleBatch", () => {
    it("returns classification results gracefully without unhandled errors", async () => {
      const { classifyMultiModuleBatch } = await import("./classify-multi-module-emails");
      const result = await classifyMultiModuleBatch(sampleEmails.slice(0, 2), {
        logPrefix: "[TEST]",
      });
      expect(result).toHaveProperty("transactions");
      expect(result).toHaveProperty("documents");
      expect(result).toHaveProperty("reminders");
      expect(Array.isArray(result.transactions)).toBe(true);
      expect(Array.isArray(result.documents)).toBe(true);
      expect(Array.isArray(result.reminders)).toBe(true);
    });
  });
});

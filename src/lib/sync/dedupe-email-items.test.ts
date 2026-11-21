import { describe, it, expect } from "vitest";
import {
  areDuplicateReminders,
  areDuplicateDocuments,
  removeDuplicateReminders,
  removeDuplicateDocuments,
  clubReminders,
  clubDocuments,
} from "./dedupe-email-items";

describe("dedupe-email-items", () => {
  describe("areDuplicateReminders", () => {
    it("identifies matching reminders with slight title variation and same due date", () => {
      const a = {
        title: "HDFC Credit Card Bill Due",
        dueAt: new Date("2026-12-05T00:00:00.000Z"),
        amount: 5400,
      };
      const b = {
        title: "Reminder: HDFC Credit Card Bill Due",
        dueAt: new Date("2026-12-05T12:00:00.000Z"),
        amount: 5400,
      };
      expect(areDuplicateReminders(a, b)).toBe(true);
    });

    it("rejects reminders with different due dates (> 2 days)", () => {
      const a = {
        title: "Electricity Bill Due",
        dueAt: new Date("2026-11-10T00:00:00.000Z"),
      };
      const b = {
        title: "Electricity Bill Due",
        dueAt: new Date("2026-12-10T00:00:00.000Z"),
      };
      expect(areDuplicateReminders(a, b)).toBe(false);
    });
  });

  describe("areDuplicateDocuments", () => {
    it("identifies matching documents within 14 days", () => {
      const a = {
        documentTitle: "Tata AIA Life Insurance Policy",
        documentType: "INSURANCE",
        receivedAt: new Date("2026-11-01T00:00:00.000Z"),
      };
      const b = {
        documentTitle: "Tata AIA Life Insurance Policy Schedule",
        documentType: "INSURANCE",
        receivedAt: new Date("2026-11-05T00:00:00.000Z"),
      };
      expect(areDuplicateDocuments(a, b)).toBe(true);
    });

    it("distinguishes documents received far apart (> 14 days)", () => {
      const a = {
        documentTitle: "Bank Statement",
        documentType: "STATEMENT",
        receivedAt: new Date("2026-08-01T00:00:00.000Z"),
      };
      const b = {
        documentTitle: "Bank Statement",
        documentType: "STATEMENT",
        receivedAt: new Date("2026-11-01T00:00:00.000Z"),
      };
      expect(areDuplicateDocuments(a, b)).toBe(false);
    });
  });

  describe("clubbing", () => {
    it("clubs reminders keeping higher confidence candidate", () => {
      const list = [
        {
          id: "1",
          title: "Jio Fiber Bill Due",
          dueAt: new Date("2026-11-20T00:00:00.000Z"),
          aiConfidence: 0.85,
        },
        {
          id: "2",
          title: "Urgent: Jio Fiber Bill Due",
          dueAt: new Date("2026-11-20T00:00:00.000Z"),
          aiConfidence: 0.95,
        },
      ];
      const clubbed = clubReminders(list);
      expect(clubbed).toHaveLength(1);
      expect(clubbed[0].id).toBe("2");
    });

    it("clubs documents keeping higher confidence candidate", () => {
      const list = [
        {
          id: "d1",
          documentTitle: "Car Insurance Policy",
          documentType: "INSURANCE",
          receivedAt: new Date("2026-11-01T00:00:00.000Z"),
          aiConfidence: 0.7,
        },
        {
          id: "d2",
          documentTitle: "Car Insurance Policy Copy",
          documentType: "INSURANCE",
          receivedAt: new Date("2026-11-02T00:00:00.000Z"),
          aiConfidence: 0.9,
        },
      ];
      const clubbed = clubDocuments(list);
      expect(clubbed).toHaveLength(1);
      expect(clubbed[0].id).toBe("d2");
    });

    it("filters out duplicates against existing items", () => {
      const existing = [
        { title: "Jio Fiber Bill Due", dueAt: new Date("2026-11-20T00:00:00.000Z") },
      ];
      const incoming = [
        { title: "Urgent: Jio Fiber Bill Due", dueAt: new Date("2026-11-20T00:00:00.000Z") },
      ];
      expect(removeDuplicateReminders(incoming, existing)).toHaveLength(0);

      const existingDoc = [
        {
          documentTitle: "Car Insurance",
          documentType: "INSURANCE",
          receivedAt: new Date("2026-11-01T00:00:00.000Z"),
        },
      ];
      const incomingDoc = [
        {
          documentTitle: "Car Insurance",
          documentType: "INSURANCE",
          receivedAt: new Date("2026-11-01T00:00:00.000Z"),
        },
      ];
      expect(removeDuplicateDocuments(incomingDoc, existingDoc)).toHaveLength(0);
    });
  });
});

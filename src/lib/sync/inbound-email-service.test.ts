import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveUserForInboundEmail, processInboundEmail } from "./inbound-email-service";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    inboundEmailAttachment: {
      create: vi.fn().mockResolvedValue({ id: "att-1" }),
    },
    emailDocumentImport: {
      create: vi.fn().mockResolvedValue({ id: "doc-1" }),
    },
    emailReminderImport: {
      create: vi.fn().mockResolvedValue({ id: "rem-1" }),
    },
    emailTransactionImport: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    wealthAccount: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    wealthTransaction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    pdfPasswordSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/sync/classify-multi-module-emails", () => ({
  classifyMultiModuleBatch: vi.fn().mockResolvedValue({
    transactions: [],
    documents: [
      {
        messageId: "msg-123",
        confidence: 0.9,
        reason: "Insurance policy document",
        documentTitle: "HDFC Life Policy",
        documentType: "INSURANCE_POLICY",
        expiryDate: new Date("2027-01-01"),
        filename: "policy.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
      },
    ],
    reminders: [
      {
        messageId: "msg-123",
        confidence: 0.85,
        reason: "Annual premium renewal",
        title: "Pay HDFC Life Premium",
        description: "Due on 2027-01-01",
        category: "INSURANCE",
        dueAt: new Date("2027-01-01"),
        amount: 50000,
        currency: "INR",
      },
    ],
  }),
}));

describe("inbound-email-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveUserForInboundEmail", () => {
    it("resolves user by inboundEmailToken tag e.g. username+token@domain", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: "user-123",
        email: "nilay@gmail.com",
        name: "Nilay",
        inboundAllowedSenders: [],
        inboundEmailEnabled: true,
      } as never);

      const resolved = await resolveUserForInboundEmail("nilay+a8f3b2@vaulty.mnilay.com");
      expect(resolved).toEqual({
        id: "user-123",
        email: "nilay@gmail.com",
        name: "Nilay",
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            inboundEmailToken: "a8f3b2",
          }),
        }),
      );
    });

    it("enforces allowedSenders whitelist when configured", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: "user-123",
        email: "nilay@gmail.com",
        name: "Nilay",
        inboundAllowedSenders: ["trusted@example.com"],
        inboundEmailEnabled: true,
      } as never);

      // Sender not in whitelist
      const rejected = await resolveUserForInboundEmail(
        "nilay+docs@vaulty.mnilay.com",
        "spammer@evil.com",
      );
      expect(rejected).toBeNull();

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
        id: "user-123",
        email: "nilay@gmail.com",
        name: "Nilay",
        inboundAllowedSenders: ["trusted@example.com"],
        inboundEmailEnabled: true,
      } as never);

      // Sender in whitelist
      const accepted = await resolveUserForInboundEmail(
        "nilay+docs@vaulty.mnilay.com",
        "trusted@example.com",
      );
      expect(accepted).not.toBeNull();
      expect(accepted?.id).toBe("user-123");
    });

    it("falls back to user email local part matching if token/slug is not set", async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        {
          id: "user-456",
          email: "john@example.com",
          name: "John",
          inboundAllowedSenders: [],
          inboundEmailEnabled: true,
        },
      ] as never);

      const resolved = await resolveUserForInboundEmail("john+docs@vaulty.mnilay.com");
      expect(resolved).toEqual({
        id: "user-456",
        email: "john@example.com",
        name: "John",
      });
    });
  });

  describe("processInboundEmail", () => {
    it("stages attachments, classifies content, and creates staged documents and reminders", async () => {
      const dummyPdf = Buffer.from("%PDF-1.4 minimal test");
      const result = await processInboundEmail({
        userId: "user-123",
        from: "alerts@hdfclife.com",
        to: "nilay+docs@vaulty.mnilay.com",
        subject: "Your Annual Policy Renewal Statement",
        textBody: "Your policy renewal is due on 2027-01-01.",
        messageId: "resend-msg-1",
        receivedAt: new Date("2026-11-17"),
        attachments: [
          {
            filename: "policy.pdf",
            mimeType: "application/pdf",
            data: dummyPdf,
          },
        ],
      });

      expect(result.userId).toBe("user-123");
      expect(result.attachmentsSaved).toBe(1);
      expect(result.documentsDiscovered).toBe(1);
      expect(result.remindersDiscovered).toBe(1);

      expect(prisma.inboundEmailAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-123",
            filename: "policy.pdf",
            mimeType: "application/pdf",
          }),
        }),
      );

      expect(prisma.emailDocumentImport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: "user-123",
            sourceProvider: "FORWARDING",
            documentTitle: "HDFC Life Policy",
            documentType: "INSURANCE_POLICY",
          }),
        }),
      );

      expect(prisma.emailReminderImport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: "user-123",
            sourceProvider: "FORWARDING",
            title: "Pay HDFC Life Premium",
            category: "INSURANCE",
          }),
        }),
      );
    });
  });
});

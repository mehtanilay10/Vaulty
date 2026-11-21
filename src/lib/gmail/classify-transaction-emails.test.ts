import { describe, expect, it } from "vitest";
import {
  rankFinancialEmails,
  type GmailEmailForClassification,
} from "./classify-transaction-emails";

function email(
  messageId: string,
  from: string,
  subject: string,
  body: string,
): GmailEmailForClassification {
  return { messageId, from, subject, body, receivedAt: new Date("2026-11-08T08:00:00.000Z") };
}

describe("financial email relevance ranking", () => {
  it("keeps transaction alerts and filters promotional/personal messages", () => {
    const result = rankFinancialEmails([
      email(
        "bank",
        "alerts@hdfcbank.com",
        "INR 1,250 debited from your account",
        "UPI transaction successful. UTR 123456.",
      ),
      email(
        "promo",
        "offers@shop.example.com",
        "Exclusive offer - shop now",
        "Limited time offer. Unsubscribe.",
      ),
      email(
        "personal",
        "friend@example.com",
        "Birthday party this weekend",
        "Hope you can join us.",
      ),
    ]);
    expect(result.map((item) => item.messageId)).toContain("bank");
    expect(result.map((item) => item.messageId)).not.toContain("promo");
    expect(result.map((item) => item.messageId)).not.toContain("personal");
  });

  it("never returns more than the requested AI processing cap", () => {
    const messages = Array.from({ length: 45 }, (_, index) =>
      email(
        String(index),
        "alerts@bank.example.com",
        "Transaction successful - amount debited",
        "Your account has been debited INR 500. UTR 123456.",
      ),
    );
    expect(rankFinancialEmails(messages, 30)).toHaveLength(30);
  });
});

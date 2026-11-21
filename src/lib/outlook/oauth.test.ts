import { describe, expect, it } from "vitest";
import { normalizeOutlookBody, type OutlookMessage } from "./oauth";

describe("normalizeOutlookBody", () => {
  it("converts HTML email bodies into readable plain text and removes scripts", () => {
    const message: OutlookMessage = {
      id: "message-1",
      body: {
        contentType: "html",
        content:
          "<html><body><p>INR 1,250 debited</p><script>ignore this</script><p>Merchant: Store</p></body></html>",
      },
    };
    const result = normalizeOutlookBody(message);
    expect(result).toContain("INR 1,250 debited");
    expect(result).toContain("Merchant: Store");
    expect(result).not.toContain("ignore this");
  });

  it("uses the plain-text body when Graph returns text", () => {
    const message: OutlookMessage = {
      id: "message-2",
      body: { contentType: "text", content: "Your account was credited INR 500." },
    };
    expect(normalizeOutlookBody(message)).toBe("Your account was credited INR 500.");
  });
});

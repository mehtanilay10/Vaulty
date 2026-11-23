import { describe, it, expect } from "vitest";
import { base32Decode, parseOtpAuthUri, getTOTPRemainingSeconds, generateTOTP } from "./totp";

describe("totp", () => {
  describe("base32Decode", () => {
    it("decodes standard Base32 strings correctly", () => {
      // "Hello!" -> JBSWY3DPEE======
      const decoded = base32Decode("JBSWY3DPEE======");
      expect(new TextDecoder().decode(decoded)).toBe("Hello!");
    });

    it("handles whitespace, hyphens, and lowercase characters", () => {
      const decoded = base32Decode("jbsw-y3dp ee");
      expect(new TextDecoder().decode(decoded)).toBe("Hello!");
    });

    it("throws on invalid Base32 character", () => {
      expect(() => base32Decode("JBSWY8")).toThrow(/Invalid Base32 character/);
    });
  });

  describe("parseOtpAuthUri", () => {
    it("parses full otpauth URI correctly", () => {
      const uri =
        "otpauth://totp/Example:alice@google.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA1&digits=6&period=30";
      const parsed = parseOtpAuthUri(uri);
      expect(parsed).toEqual({
        type: "totp",
        secret: "JBSWY3DPEHPK3PXP",
        issuer: "Example",
        account: "alice@google.com",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });
    });

    it("parses URI without explicit issuer query param", () => {
      const uri =
        "otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ";
      const parsed = parseOtpAuthUri(uri);
      expect(parsed?.issuer).toBe("ACME Co");
      expect(parsed?.account).toBe("john.doe@email.com");
      expect(parsed?.secret).toBe("HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ");
      expect(parsed?.digits).toBe(6);
      expect(parsed?.period).toBe(30);
    });

    it("returns null for non-otpauth URI", () => {
      expect(parseOtpAuthUri("https://example.com")).toBeNull();
      expect(parseOtpAuthUri("random string")).toBeNull();
    });
  });

  describe("getTOTPRemainingSeconds", () => {
    it("returns value between 1 and stepSeconds", () => {
      const remaining = getTOTPRemainingSeconds(30);
      expect(remaining).toBeGreaterThanOrEqual(1);
      expect(remaining).toBeLessThanOrEqual(30);
    });
  });

  describe("generateTOTP", () => {
    // RFC 6238 Appendix B test vectors
    // Secret: ASCII "12345678901234567890" -> Base32: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    it("matches RFC 6238 test vector for T=59 (6 digits: 287082)", async () => {
      const code = await generateTOTP(rfcSecret, 59);
      expect(code).toBe("287082");
    });

    it("matches RFC 6238 test vector for T=1111111109 (6 digits: 081804)", async () => {
      const code = await generateTOTP(rfcSecret, 1111111109);
      expect(code).toBe("081804");
    });

    it("matches RFC 6238 test vector for T=1111111111 (6 digits: 050471)", async () => {
      const code = await generateTOTP(rfcSecret, 1111111111);
      expect(code).toBe("050471");
    });

    it("matches RFC 6238 test vector for T=1234567890 (6 digits: 005924)", async () => {
      const code = await generateTOTP(rfcSecret, 1234567890);
      expect(code).toBe("005924");
    });

    it("matches RFC 6238 test vector for T=2000000000 (6 digits: 279037)", async () => {
      const code = await generateTOTP(rfcSecret, 2000000000);
      expect(code).toBe("279037");
    });

    it("supports 8 digits option", async () => {
      const code = await generateTOTP(rfcSecret, 59, { digits: 8 });
      expect(code).toBe("94287082");
    });

    it("supports passing otpauth:// URI directly", async () => {
      const uri = `otpauth://totp/Test:user?secret=${rfcSecret}&period=30&digits=6`;
      const code = await generateTOTP(uri, 59);
      expect(code).toBe("287082");
    });
  });
});

import { describe, expect, it } from "vitest";
import { generatePdfPasswordCandidates } from "@/lib/pdf-passwords";

describe("generatePdfPasswordCandidates", () => {
  it("combines personal and custom tokens for matching institutions", () => {
    const candidates = generatePdfPasswordCandidates(
      {
        values: { firstName: "Nilay", dateOfBirth: "01011990" },
        customValues: { customerId: "ABC123" },
        templates: [
          { id: "1", institution: "HDFC", pattern: "{{firstName}}{{dateOfBirth}}", enabled: true },
          { id: "2", institution: "DEFAULT", pattern: "{{customerId}}", enabled: true },
          { id: "3", institution: "ICICI", pattern: "wrong-template", enabled: true },
        ],
      },
      "HDFC Bank",
      "",
    );
    expect(candidates).toEqual(["Nilay01011990", "ABC123"]);
  });

  it("prioritizes explicit password hints and removes duplicates", () => {
    const candidates = generatePdfPasswordCandidates(
      {
        values: { firstName: "Test" },
        customValues: {},
        templates: [
          { id: "1", institution: "DEFAULT", pattern: "{{firstName}}1234", enabled: true },
        ],
      },
      "Bank",
      "Your statement PDF password is PASS1234.",
    );
    expect(candidates[0]).toBe("PASS1234");
    expect(candidates).toHaveLength(2);
  });
});

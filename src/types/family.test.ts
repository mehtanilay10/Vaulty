import { describe, expect, it } from "vitest";
import {
  emptyFamilyModuleFlags,
  familyModuleLabels,
  familyModulesFromFlags,
  isFamilyModuleShared,
  isValidFamilyEmail,
  normalizeFamilyEmail,
  parseFamilyModuleFlags,
  hasAnyFamilyModule,
} from "@/types/family";

describe("family module helpers", () => {
  it("returns an empty flag set", () => {
    expect(emptyFamilyModuleFlags()).toEqual({
      shareDocuments: false,
      shareWealth: false,
      shareCredentials: false,
      shareReminders: false,
    });
    expect(hasAnyFamilyModule(emptyFamilyModuleFlags())).toBe(false);
  });

  it("parses only literal true values from untrusted input", () => {
    expect(
      parseFamilyModuleFlags({
        shareDocuments: true,
        shareWealth: "yes",
        shareCredentials: 1,
      }),
    ).toEqual({
      shareDocuments: true,
      shareWealth: false,
      shareCredentials: false,
      shareReminders: false,
    });
  });

  it("rejects flag sets with no selected module", () => {
    expect(parseFamilyModuleFlags({})).toBeNull();
    expect(parseFamilyModuleFlags({ shareDocuments: false })).toBeNull();
    expect(parseFamilyModuleFlags(null)).toBeNull();
    expect(parseFamilyModuleFlags("shareDocuments")).toBeNull();
  });

  it("lists modules in a stable order", () => {
    const flags = {
      shareDocuments: true,
      shareWealth: false,
      shareCredentials: true,
      shareReminders: false,
    };

    expect(familyModulesFromFlags(flags)).toEqual(["documents", "credentials"]);
    expect(familyModuleLabels(flags)).toEqual(["Documents", "Credentials"]);
    expect(isFamilyModuleShared(flags, "wealth")).toBe(false);
    expect(isFamilyModuleShared(flags, "documents")).toBe(true);
  });
});

describe("family email helpers", () => {
  it("normalizes surrounding whitespace and casing", () => {
    expect(normalizeFamilyEmail("  Family@Example.COM ")).toBe("family@example.com");
  });

  it("validates simple email addresses", () => {
    expect(isValidFamilyEmail("a@b.co")).toBe(true);
    expect(isValidFamilyEmail("not-an-email")).toBe(false);
    expect(isValidFamilyEmail("a@b")).toBe(false);
    expect(isValidFamilyEmail("")).toBe(false);
  });
});

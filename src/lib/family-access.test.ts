import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    familyMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  checkFamilyModuleAccess,
  familyMembershipAllowsModule,
  getFamilyMembershipsForMember,
} from "@/lib/family-access";

describe("family access isolation", () => {
  beforeEach(() => {
    prismaMock.familyMembership.findUnique.mockReset();
    prismaMock.familyMembership.findMany.mockReset();
  });

  it("revokes access on the next authorization check when membership is deleted", async () => {
    prismaMock.familyMembership.findUnique.mockResolvedValue(null);
    await expect(
      checkFamilyModuleAccess("member-1", "owner-1", "documents"),
    ).resolves.toMatchObject({
      hasAccess: false,
      membership: null,
      reason: "NOT_FOUND",
    });
  });

  it("disables only the selected module without changing other module grants", () => {
    const membership = {
      shareDocuments: true,
      shareWealth: false,
      shareCredentials: true,
      shareReminders: false,
      shareNotes: false,
    };
    expect(familyMembershipAllowsModule(membership, "documents")).toBe(true);
    expect(familyMembershipAllowsModule(membership, "wealth")).toBe(false);
    expect(familyMembershipAllowsModule(membership, "credentials")).toBe(true);
    expect(familyMembershipAllowsModule(membership, "reminders")).toBe(false);
    expect(familyMembershipAllowsModule(membership, "notes")).toBe(false);
  });

  it("keeps memberships from two owners independent for the same member", async () => {
    prismaMock.familyMembership.findMany.mockResolvedValue([
      {
        id: "membership-a",
        ownerId: "owner-a",
        memberId: "member-1",
        shareCredentials: true,
        owner: { id: "owner-a" },
      },
      {
        id: "membership-b",
        ownerId: "owner-b",
        memberId: "member-1",
        shareCredentials: true,
        owner: { id: "owner-b" },
      },
    ]);

    const memberships = await getFamilyMembershipsForMember("member-1", "credentials");
    expect(memberships).toHaveLength(2);
    expect(memberships.map((item) => item.ownerId)).toEqual(["owner-a", "owner-b"]);
    expect(prismaMock.familyMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId: "member-1", shareCredentials: true },
      }),
    );
  });
});

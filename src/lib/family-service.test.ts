import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, createNotificationMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    familyInvitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    familyMembership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    familyCredentialKey: { upsert: vi.fn(), deleteMany: vi.fn() },
    folder: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    wealthAccount: { findMany: vi.fn() },
    appCredential: { findMany: vi.fn() },
    bankCredential: { findMany: vi.fn() },
    passwordVault: { findUnique: vi.fn(), update: vi.fn() },
    notification: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
  createNotificationMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({
  createNotification: createNotificationMock,
}));
vi.mock("@/lib/wealth", () => ({
  withoutPin: <T extends { pin?: string | null }>(account: T) => {
    const copy = { ...account };
    delete copy.pin;
    return copy;
  },
}));

import {
  FamilyServiceError,
  acceptFamilyInvitation,
  cancelFamilyInvitation,
  createFamilyInvitation,
  deleteWrappedFamilyCredentialKey,
  getFamilySharedCredentials,
  getFamilySharedDocuments,
  getFamilySharedWealth,
  registerFamilyCredentialKey,
  rejectFamilyInvitation,
  resendFamilyInvitation,
  revokeFamilyMembership,
  storeWrappedFamilyCredentialKey,
  updateFamilyInvitation,
  updateFamilyMembership,
} from "@/lib/family-service";
import type { FamilyModuleFlags } from "@/types/family";

const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE = () => new Date(Date.now() + 3 * DAY_MS);
const PAST = () => new Date(Date.now() - DAY_MS);

function flags(overrides: Record<string, boolean> = {}): FamilyModuleFlags {
  return {
    shareDocuments: false,
    shareWealth: false,
    shareCredentials: false,
    shareReminders: false,
    ...overrides,
  };
}

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    ownerId: "owner-1",
    email: "member@example.com",
    token: "token-1",
    status: "PENDING",
    shareDocuments: true,
    shareWealth: false,
    shareCredentials: false,
    shareReminders: false,
    expiresAt: FUTURE(),
    respondedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function membershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "membership-1",
    ownerId: "owner-1",
    memberId: "member-1",
    shareDocuments: true,
    shareWealth: false,
    shareCredentials: false,
    shareReminders: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const owner = {
  id: "owner-1",
  name: "Owner",
  email: "owner@example.com",
  image: null,
};

const member = {
  id: "member-1",
  name: "Member",
  email: "member@example.com",
  image: null,
};

async function expectFamilyError(promise: Promise<unknown>, code: string, status: number) {
  await expect(promise).rejects.toBeInstanceOf(FamilyServiceError);
  await expect(promise).rejects.toMatchObject({ code, status });
}

beforeEach(() => {
  delete process.env.RESEND_API_KEY;

  for (const delegate of [
    prismaMock.user,
    prismaMock.familyInvitation,
    prismaMock.familyMembership,
    prismaMock.familyCredentialKey,
    prismaMock.folder,
    prismaMock.wealthAccount,
    prismaMock.appCredential,
    prismaMock.bankCredential,
    prismaMock.passwordVault,
    prismaMock.notification,
  ]) {
    for (const fn of Object.values(delegate)) fn.mockReset();
  }

  prismaMock.$transaction
    .mockReset()
    .mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock),
    );
  createNotificationMock.mockReset();
});

/* -------------------------------------------------------------------------- */
/* Invitations                                                                 */
/* -------------------------------------------------------------------------- */

describe("createFamilyInvitation", () => {
  it("rejects an invitation with no modules before touching the database", async () => {
    await expectFamilyError(
      createFamilyInvitation({
        ownerId: "owner-1",
        email: "member@example.com",
        flags: flags(),
      }),
      "NO_MODULES",
      400,
    );

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an empty email", async () => {
    await expectFamilyError(
      createFamilyInvitation({
        ownerId: "owner-1",
        email: "   ",
        flags: flags({ shareDocuments: true }),
      }),
      "INVALID_EMAIL",
      400,
    );
  });

  it("rejects a missing owner", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expectFamilyError(
      createFamilyInvitation({
        ownerId: "owner-1",
        email: "member@example.com",
        flags: flags({ shareDocuments: true }),
      }),
      "OWNER_NOT_FOUND",
      404,
    );
  });

  it("prevents inviting your own email address", async () => {
    prismaMock.user.findUnique.mockResolvedValue(owner);

    await expectFamilyError(
      createFamilyInvitation({
        ownerId: "owner-1",
        email: "  OWNER@example.com ",
        flags: flags({ shareDocuments: true }),
      }),
      "SELF_INVITE",
      400,
    );

    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("prevents inviting the owner through a secondary email record", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...owner, email: null });
    prismaMock.user.findFirst.mockResolvedValue({ id: "owner-1" });

    await expectFamilyError(
      createFamilyInvitation({
        ownerId: "owner-1",
        email: "other@example.com",
        flags: flags({ shareDocuments: true }),
      }),
      "SELF_INVITE",
      400,
    );
  });

  it("prevents inviting somebody who is already a member", async () => {
    prismaMock.user.findUnique.mockResolvedValue(owner);
    prismaMock.user.findFirst.mockResolvedValue({ id: "member-1" });
    prismaMock.familyMembership.findUnique.mockResolvedValue({
      id: "membership-1",
    });

    await expectFamilyError(
      createFamilyInvitation({
        ownerId: "owner-1",
        email: "member@example.com",
        flags: flags({ shareDocuments: true }),
      }),
      "ALREADY_MEMBER",
      409,
    );
  });

  it("reuses an existing pending invitation idempotently", async () => {
    const existing = invitation();
    prismaMock.user.findUnique.mockResolvedValue(owner);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.familyInvitation.findUnique.mockResolvedValue(existing);

    const result = await createFamilyInvitation({
      ownerId: "owner-1",
      email: "member@example.com",
      flags: flags({ shareDocuments: true }),
    });

    expect(result.invitation.id).toBe(existing.id);
    expect(result.invitation.email).toBe(existing.email);
    expect(result.emailSent).toBe(false);
    expect(prismaMock.familyInvitation.upsert).not.toHaveBeenCalled();
  });

  it("creates a normalized invitation and returns the manual invite link", async () => {
    prismaMock.user.findUnique.mockResolvedValue(owner);
    prismaMock.user.findFirst.mockResolvedValue({ id: "member-1" });
    prismaMock.familyInvitation.findUnique.mockResolvedValue(null);
    prismaMock.familyInvitation.upsert.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => invitation(create),
    );

    const result = await createFamilyInvitation({
      ownerId: "owner-1",
      email: "  Member@Example.COM ",
      flags: flags({ shareDocuments: true, shareWealth: true }),
    });

    expect(prismaMock.familyInvitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerId_email: {
            ownerId: "owner-1",
            email: "member@example.com",
          },
        },
        create: expect.objectContaining({
          email: "member@example.com",
          shareDocuments: true,
          shareWealth: true,
          shareCredentials: false,
        }),
      }),
    );
    expect(result.emailSent).toBe(false);
    expect(result.inviteUrl).toContain("/family/accept?token=");
    expect(result.invitation.email).toBe("member@example.com");
    expect(result.invitation.status).toBe("PENDING");
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "member-1", type: "FAMILY_INVITE" }),
    );
  });

  it("re-issues an expired invitation with a fresh token", async () => {
    const expired = invitation({ expiresAt: PAST(), token: "old-token" });
    prismaMock.user.findUnique.mockResolvedValue(owner);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.familyInvitation.findUnique.mockResolvedValue(expired);
    prismaMock.familyInvitation.upsert.mockImplementation(
      async ({ update }: { update: Record<string, unknown> }) =>
        invitation({ ...update, id: expired.id }),
    );

    const result = await createFamilyInvitation({
      ownerId: "owner-1",
      email: "member@example.com",
      flags: flags({ shareCredentials: true }),
    });

    const upsertArgs = prismaMock.familyInvitation.upsert.mock.calls[0][0];
    expect(upsertArgs.update.token).toBeDefined();
    expect(upsertArgs.update.token).not.toBe("old-token");
    expect(upsertArgs.update.status).toBe("PENDING");
    expect(result.invitation.inviteUrl).toContain(upsertArgs.update.token);
  });
});

describe("acceptFamilyInvitation", () => {
  it("rejects an unknown token", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(null);

    await expectFamilyError(
      acceptFamilyInvitation({
        userId: "member-1",
        userEmail: "member@example.com",
        token: "missing",
      }),
      "INVITATION_NOT_FOUND",
      404,
    );
  });

  it("prevents the owner from accepting their own invitation", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(invitation());

    await expectFamilyError(
      acceptFamilyInvitation({
        userId: "owner-1",
        userEmail: "owner@example.com",
        token: "token-1",
      }),
      "SELF_INVITE",
      400,
    );
  });

  it("requires the signed-in email to match the invitation", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(invitation());

    await expectFamilyError(
      acceptFamilyInvitation({
        userId: "member-1",
        userEmail: "someone-else@example.com",
        token: "token-1",
      }),
      "EMAIL_MISMATCH",
      403,
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("matches emails case-insensitively", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(invitation());
    prismaMock.familyInvitation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.familyMembership.create.mockResolvedValue(membershipRow({ owner, member }));

    await expect(
      acceptFamilyInvitation({
        userId: "member-1",
        userEmail: "  MEMBER@Example.com ",
        token: "token-1",
      }),
    ).resolves.toMatchObject({ id: "membership-1" });
  });

  it("expires an old invitation and refuses acceptance", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(invitation({ expiresAt: PAST() }));
    prismaMock.familyInvitation.updateMany.mockResolvedValue({ count: 1 });

    await expectFamilyError(
      acceptFamilyInvitation({
        userId: "member-1",
        userEmail: "member@example.com",
        token: "token-1",
      }),
      "INVITATION_EXPIRED",
      410,
    );

    expect(prismaMock.familyInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED" } }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses invitations that were already answered", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(
      invitation({ status: "ACCEPTED", respondedAt: new Date() }),
    );

    await expectFamilyError(
      acceptFamilyInvitation({
        userId: "member-1",
        userEmail: "member@example.com",
        token: "token-1",
      }),
      "INVITATION_NOT_PENDING",
      409,
    );
  });

  it("returns the existing membership on a repeated acceptance without creating a duplicate", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(
      invitation({ status: "ACCEPTED", respondedAt: new Date(), owner }),
    );
    prismaMock.familyMembership.findUnique.mockResolvedValue({ ...membershipRow(), owner, member });
    createNotificationMock.mockResolvedValue(undefined);

    const result = await acceptFamilyInvitation({
      userId: "member-1",
      userEmail: "MEMBER@example.com",
      token: "token-1",
    });
    expect(result).toMatchObject({ id: "membership-1", ownerId: "owner-1", memberId: "member-1" });
    expect(prismaMock.familyMembership.upsert).not.toHaveBeenCalled();
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
    expect(createNotificationMock.mock.calls[0][0].idempotencyKey).toBe(
      "family-accepted-owner:membership-1",
    );
    expect(createNotificationMock.mock.calls[1][0].idempotencyKey).toBe(
      "family-accepted-member:membership-1",
    );
  });

  it("creates a membership copying the invitation's modules", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(
      invitation({ shareDocuments: true, shareWealth: true, owner }),
    );
    prismaMock.familyInvitation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.familyMembership.create.mockResolvedValue(
      membershipRow({
        shareDocuments: true,
        shareWealth: true,
        owner,
        member,
      }),
    );

    const result = await acceptFamilyInvitation({
      userId: "member-1",
      userEmail: "member@example.com",
      token: "token-1",
    });

    expect(prismaMock.familyInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: expect.any(Date) },
    });
    expect(prismaMock.familyMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "owner-1",
          memberId: "member-1",
          shareDocuments: true,
          shareWealth: true,
        }),
      }),
    );
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ownerId: "owner-1",
      memberId: "member-1",
      shareDocuments: true,
      shareWealth: true,
    });
  });

  it("fails when another request already answered the invitation", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(invitation());
    prismaMock.familyInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expectFamilyError(
      acceptFamilyInvitation({
        userId: "member-1",
        userEmail: "member@example.com",
        token: "token-1",
      }),
      "INVITATION_NOT_PENDING",
      409,
    );

    expect(prismaMock.familyMembership.upsert).not.toHaveBeenCalled();
  });
});

describe("rejectFamilyInvitation", () => {
  it("marks a pending invitation as rejected", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(invitation());
    prismaMock.familyInvitation.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      rejectFamilyInvitation({
        userId: "member-1",
        userEmail: "member@example.com",
        token: "token-1",
      }),
    ).resolves.toEqual({ success: true });

    expect(prismaMock.familyInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", status: "PENDING" },
      data: { status: "REJECTED", respondedAt: expect.any(Date) },
    });
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        type: "FAMILY_INVITE_REJECTED",
      }),
    );
  });

  it("fails when the invitation is no longer pending", async () => {
    prismaMock.familyInvitation.findUnique.mockResolvedValue(invitation());
    prismaMock.familyInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expectFamilyError(
      rejectFamilyInvitation({
        userId: "member-1",
        userEmail: "member@example.com",
        token: "token-1",
      }),
      "INVITATION_NOT_PENDING",
      409,
    );
  });
});

describe("updateFamilyInvitation", () => {
  it("requires at least one module", async () => {
    await expectFamilyError(
      updateFamilyInvitation({
        ownerId: "owner-1",
        invitationId: "inv-1",
        flags: flags(),
      }),
      "NO_MODULES",
      400,
    );
  });

  it("only edits invitations owned by the caller", async () => {
    prismaMock.familyInvitation.findFirst.mockResolvedValue(null);

    await expectFamilyError(
      updateFamilyInvitation({
        ownerId: "owner-1",
        invitationId: "inv-1",
        flags: flags({ shareDocuments: true }),
      }),
      "INVITATION_NOT_FOUND",
      404,
    );
  });

  it("only edits pending invitations", async () => {
    prismaMock.familyInvitation.findFirst.mockResolvedValue(invitation({ status: "ACCEPTED" }));

    await expectFamilyError(
      updateFamilyInvitation({
        ownerId: "owner-1",
        invitationId: "inv-1",
        flags: flags({ shareDocuments: true }),
      }),
      "INVITATION_NOT_PENDING",
      409,
    );
  });

  it("expires stale invitations before editing", async () => {
    prismaMock.familyInvitation.findFirst.mockResolvedValue(invitation({ expiresAt: PAST() }));
    prismaMock.familyInvitation.update.mockResolvedValue({});

    await expectFamilyError(
      updateFamilyInvitation({
        ownerId: "owner-1",
        invitationId: "inv-1",
        flags: flags({ shareDocuments: true }),
      }),
      "INVITATION_EXPIRED",
      410,
    );

    expect(prismaMock.familyInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "EXPIRED" },
    });
  });

  it("updates module flags", async () => {
    prismaMock.familyInvitation.findFirst.mockResolvedValue(invitation());
    prismaMock.familyInvitation.update.mockResolvedValue(
      invitation({ shareDocuments: false, shareCredentials: true }),
    );

    const result = await updateFamilyInvitation({
      ownerId: "owner-1",
      invitationId: "inv-1",
      flags: flags({ shareCredentials: true }),
    });

    expect(prismaMock.familyInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: {
        shareDocuments: false,
        shareWealth: false,
        shareCredentials: true,
        shareReminders: false,
      },
    });
    expect(result.shareDocuments).toBe(false);
    expect(result.shareCredentials).toBe(true);
  });
});

describe("cancelFamilyInvitation", () => {
  it("revokes only the caller's pending invitation", async () => {
    prismaMock.familyInvitation.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      cancelFamilyInvitation({ ownerId: "owner-1", invitationId: "inv-1" }),
    ).resolves.toEqual({ success: true });

    expect(prismaMock.familyInvitation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "inv-1",
        ownerId: "owner-1",
        status: "PENDING",
      },
      data: { status: "REVOKED", respondedAt: expect.any(Date) },
    });
  });

  it("fails when nothing was cancelled", async () => {
    prismaMock.familyInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expectFamilyError(
      cancelFamilyInvitation({ ownerId: "owner-1", invitationId: "inv-1" }),
      "INVITATION_NOT_PENDING",
      409,
    );
  });
});

describe("resendFamilyInvitation", () => {
  it("rotates the token of a pending invitation", async () => {
    prismaMock.familyInvitation.findFirst.mockResolvedValue(invitation({ owner }));
    prismaMock.familyInvitation.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => invitation({ ...data, owner }),
    );

    const result = await resendFamilyInvitation({
      ownerId: "owner-1",
      invitationId: "inv-1",
    });

    const updateArgs = prismaMock.familyInvitation.update.mock.calls[0][0];
    expect(updateArgs.data.token).toBeDefined();
    expect(updateArgs.data.token).not.toBe("token-1");
    expect(result.emailSent).toBe(false);
    expect(result.invitation.inviteUrl).toContain(updateArgs.data.token);
  });

  it("expires stale invitations instead of resending", async () => {
    prismaMock.familyInvitation.findFirst.mockResolvedValue(invitation({ expiresAt: PAST() }));
    prismaMock.familyInvitation.update.mockResolvedValue({});

    await expectFamilyError(
      resendFamilyInvitation({
        ownerId: "owner-1",
        invitationId: "inv-1",
      }),
      "INVITATION_EXPIRED",
      410,
    );

    expect(prismaMock.familyInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "EXPIRED" },
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Memberships                                                                */
/* -------------------------------------------------------------------------- */

describe("updateFamilyMembership", () => {
  it("requires at least one module", async () => {
    await expectFamilyError(
      updateFamilyMembership({
        ownerId: "owner-1",
        membershipId: "membership-1",
        flags: flags(),
      }),
      "NO_MODULES",
      400,
    );
  });

  it("does not let an owner edit another owner's membership", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(null);

    await expectFamilyError(
      updateFamilyMembership({
        ownerId: "owner-2",
        membershipId: "membership-1",
        flags: flags({ shareDocuments: true }),
      }),
      "MEMBERSHIP_NOT_FOUND",
      404,
    );

    expect(prismaMock.familyMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "membership-1", ownerId: "owner-2" },
      }),
    );
  });

  it("removes wrapped credential keys when credential sharing is disabled", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(membershipRow({ member }));
    prismaMock.familyMembership.update.mockResolvedValue(
      membershipRow({ member, shareDocuments: true }),
    );
    prismaMock.familyCredentialKey.deleteMany.mockResolvedValue({ count: 1 });

    await updateFamilyMembership({
      ownerId: "owner-1",
      membershipId: "membership-1",
      flags: flags({ shareDocuments: true }),
    });

    expect(prismaMock.familyMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          shareDocuments: true,
          shareWealth: false,
          shareCredentials: false,
          shareReminders: false,
        },
      }),
    );
    expect(prismaMock.familyCredentialKey.deleteMany).toHaveBeenCalledWith({
      where: { membershipId: "membership-1" },
    });
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "member-1",
        type: "FAMILY_SHARING_UPDATED",
      }),
    );
  });

  it("keeps wrapped credential keys while credentials remain shared", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(membershipRow({ member }));
    prismaMock.familyMembership.update.mockResolvedValue(
      membershipRow({
        member,
        shareDocuments: false,
        shareCredentials: true,
      }),
    );

    await updateFamilyMembership({
      ownerId: "owner-1",
      membershipId: "membership-1",
      flags: flags({ shareCredentials: true }),
    });

    expect(prismaMock.familyCredentialKey.deleteMany).not.toHaveBeenCalled();
  });
});

describe("revokeFamilyMembership", () => {
  it("deletes the membership so the next request loses access", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(membershipRow({ member }));
    prismaMock.familyMembership.delete.mockResolvedValue(membershipRow());

    await expect(
      revokeFamilyMembership({
        ownerId: "owner-1",
        membershipId: "membership-1",
      }),
    ).resolves.toEqual({ success: true });

    expect(prismaMock.familyMembership.delete).toHaveBeenCalledWith({
      where: { id: "membership-1" },
    });
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "member-1",
        type: "FAMILY_ACCESS_REVOKED",
      }),
    );
  });

  it("does not let an owner revoke another owner's membership", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(null);

    await expectFamilyError(
      revokeFamilyMembership({
        ownerId: "owner-2",
        membershipId: "membership-1",
      }),
      "MEMBERSHIP_NOT_FOUND",
      404,
    );

    expect(prismaMock.familyMembership.delete).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Shared read-only data                                                      */
/* -------------------------------------------------------------------------- */

describe("getFamilySharedDocuments", () => {
  it("returns only the folders of owners that share documents", async () => {
    prismaMock.familyMembership.findMany.mockResolvedValue([
      { id: "m-1", ownerId: "owner-1", owner },
    ]);
    prismaMock.folder.findMany.mockResolvedValue([
      {
        id: "folder-1",
        name: "Owner folder",
        ownerId: "owner-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        _count: { documents: 2, children: 1 },
      },
      {
        id: "folder-2",
        name: "Not shared",
        ownerId: "owner-2",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        _count: { documents: 0, children: 0 },
      },
    ]);
    prismaMock.document.findMany.mockResolvedValue([
      {
        id: "doc-1",
        name: "Owner root document",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        ownerId: "owner-1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "doc-2",
        name: "Other owner root document",
        mimeType: "image/png",
        sizeBytes: 2048,
        ownerId: "owner-2",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    const result = await getFamilySharedDocuments("member-1");

    expect(prismaMock.familyMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId: "member-1", shareDocuments: true },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].owner).toMatchObject({ id: "owner-1" });
    expect(result[0].folders.map((folder) => folder.id)).toEqual(["folder-1"]);
    expect(result[0].documents.map((doc) => doc.id)).toEqual(["doc-1"]);
  });

  it("does not query folders when nothing is shared", async () => {
    prismaMock.familyMembership.findMany.mockResolvedValue([]);

    await expect(getFamilySharedDocuments("member-1")).resolves.toEqual([]);
    expect(prismaMock.folder.findMany).not.toHaveBeenCalled();
    expect(prismaMock.document.findMany).not.toHaveBeenCalled();
  });
});

describe("getFamilySharedWealth", () => {
  it("strips account PINs from shared wealth data", async () => {
    prismaMock.familyMembership.findMany.mockResolvedValue([
      { id: "m-1", ownerId: "owner-1", owner },
    ]);
    prismaMock.wealthAccount.findMany.mockResolvedValue([
      {
        id: "account-1",
        ownerId: "owner-1",
        name: "Savings",
        pin: "1234",
        transactions: [],
      },
    ]);

    const result = await getFamilySharedWealth("member-1");

    expect(result[0].accounts[0]).not.toHaveProperty("pin");
    expect(result[0].accounts[0]).toMatchObject({ id: "account-1" });
  });
});

describe("getFamilySharedCredentials", () => {
  it("waits for a wrapped key before exposing credential ciphertext", async () => {
    prismaMock.familyMembership.findMany.mockResolvedValue([
      {
        id: "m-1",
        ownerId: "owner-1",
        owner: {
          ...owner,
          passwordVault: { id: "vault-1" },
        },
        credentialKey: null,
      },
    ]);
    prismaMock.appCredential.findMany.mockResolvedValue([{ id: "app-1", vaultId: "vault-1" }]);
    prismaMock.bankCredential.findMany.mockResolvedValue([]);

    const result = await getFamilySharedCredentials("member-1");

    expect(result[0].wrappedKey).toBeNull();
    expect(result[0].appCredentials).toEqual([]);
    expect(result[0].bankCredentials).toEqual([]);
  });

  it("returns ciphertext only once the owner wrapped the key", async () => {
    prismaMock.familyMembership.findMany.mockResolvedValue([
      {
        id: "m-1",
        ownerId: "owner-1",
        owner: {
          ...owner,
          passwordVault: { id: "vault-1" },
        },
        credentialKey: {
          wrappedKey: "wrapped",
          keyVersion: 2,
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    ]);
    prismaMock.appCredential.findMany.mockResolvedValue([
      { id: "app-1", vaultId: "vault-1" },
      { id: "app-2", vaultId: "other-vault" },
    ]);
    prismaMock.bankCredential.findMany.mockResolvedValue([{ id: "bank-1", vaultId: "vault-1" }]);

    const result = await getFamilySharedCredentials("member-1");

    expect(result[0].wrappedKey).toBe("wrapped");
    expect(result[0].appCredentials.map((item) => item.id)).toEqual(["app-1"]);
    expect(result[0].bankCredentials.map((item) => item.id)).toEqual(["bank-1"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Credential keys                                                            */
/* -------------------------------------------------------------------------- */

describe("registerFamilyCredentialKey", () => {
  it("requires a credential vault", async () => {
    prismaMock.passwordVault.findUnique.mockResolvedValue(null);

    await expectFamilyError(
      registerFamilyCredentialKey({
        userId: "user-1",
        publicKey: "public",
        encryptedPrivateKey: "private",
        privateKeyIv: "iv",
      }),
      "VAULT_NOT_FOUND",
      404,
    );
  });

  it("rejects missing or oversized key material", async () => {
    prismaMock.passwordVault.findUnique.mockResolvedValue({ id: "vault-1", isConfigured: true });

    await expectFamilyError(
      registerFamilyCredentialKey({
        userId: "user-1",
        publicKey: "",
        encryptedPrivateKey: "private",
        privateKeyIv: "iv",
      }),
      "INVALID_KEY_MATERIAL",
      400,
    );

    await expectFamilyError(
      registerFamilyCredentialKey({
        userId: "user-1",
        publicKey: "public",
        encryptedPrivateKey: "private",
        privateKeyIv: "x".repeat(257),
      }),
      "INVALID_KEY_MATERIAL",
      400,
    );
  });

  it("stores the family public/private key pair", async () => {
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    prismaMock.passwordVault.findUnique.mockResolvedValue({ id: "vault-1", isConfigured: true });
    prismaMock.passwordVault.update.mockResolvedValue({
      familyPublicKey: "public",
      familyEncryptedPrivateKey: "private",
      familyPrivateKeyIv: "iv",
      familyKeyUpdatedAt: updatedAt,
    });

    await expect(
      registerFamilyCredentialKey({
        userId: "user-1",
        publicKey: "public",
        encryptedPrivateKey: "private",
        privateKeyIv: "iv",
      }),
    ).resolves.toEqual({
      publicKey: "public",
      encryptedPrivateKey: "private",
      privateKeyIv: "iv",
      updatedAt: updatedAt.toISOString(),
    });
  });
});

describe("family credential public-key rotation", () => {
  it("invalidates existing wrapped keys and notifies each owner when the member key changes", async () => {
    const updatedAt = new Date("2026-11-06T00:00:00.000Z");
    prismaMock.passwordVault.findUnique.mockResolvedValue({
      id: "vault-1",
      isConfigured: true,
      familyPublicKey: "old-public-key",
    });
    prismaMock.passwordVault.update.mockResolvedValue({
      familyPublicKey: "new-public-key",
      familyEncryptedPrivateKey: "encrypted-private-key",
      familyPrivateKeyIv: "private-key-iv",
      familyKeyUpdatedAt: updatedAt,
    });
    prismaMock.familyMembership.findMany.mockResolvedValue([
      { id: "membership-1", ownerId: "owner-2" },
    ]);
    prismaMock.familyCredentialKey.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.notification.upsert.mockResolvedValue({});

    await registerFamilyCredentialKey({
      userId: "member-1",
      publicKey: "new-public-key",
      encryptedPrivateKey: "encrypted-private-key",
      privateKeyIv: "private-key-iv",
    });

    expect(prismaMock.familyCredentialKey.deleteMany).toHaveBeenCalledWith({
      where: { memberId: "member-1" },
    });
    expect(prismaMock.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idempotencyKey: `family-credential-key-rotated:membership-1:${updatedAt.getTime()}`,
        },
      }),
    );
  });
});

describe("storeWrappedFamilyCredentialKey", () => {
  it("only wraps keys for owners with credential sharing enabled", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(null);

    await expectFamilyError(
      storeWrappedFamilyCredentialKey({
        userId: "owner-1",
        membershipId: "membership-1",
        wrappedKey: "wrapped",
      }),
      "MEMBERSHIP_NOT_FOUND",
      404,
    );
  });

  it("requires the member to have registered a family public key", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(
      membershipRow({ member: { ...member, passwordVault: null } }),
    );

    await expectFamilyError(
      storeWrappedFamilyCredentialKey({
        userId: "owner-1",
        membershipId: "membership-1",
        wrappedKey: "wrapped",
      }),
      "MEMBER_KEY_MISSING",
      409,
    );
  });

  it("stores a wrapped key and notifies the member the first time", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(
      membershipRow({
        member: { ...member, passwordVault: { familyPublicKey: "public" } },
        credentialKey: null,
      }),
    );
    prismaMock.familyCredentialKey.upsert.mockResolvedValue({
      membershipId: "membership-1",
      keyVersion: 1,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(
      storeWrappedFamilyCredentialKey({
        userId: "owner-1",
        membershipId: "membership-1",
        wrappedKey: "wrapped",
      }),
    ).resolves.toMatchObject({ membershipId: "membership-1", keyVersion: 1 });

    expect(prismaMock.familyCredentialKey.upsert).toHaveBeenCalledWith({
      where: { membershipId: "membership-1" },
      create: expect.objectContaining({
        ownerId: "owner-1",
        memberId: "member-1",
        wrappedKey: "wrapped",
      }),
      update: {
        wrappedKey: "wrapped",
        keyVersion: { increment: 1 },
      },
    });
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "member-1",
        type: "FAMILY_CREDENTIAL_KEY_SHARED",
      }),
    );
  });

  it("does not notify again when rotating an existing key", async () => {
    prismaMock.familyMembership.findFirst.mockResolvedValue(
      membershipRow({
        member: { ...member, passwordVault: { familyPublicKey: "public" } },
        credentialKey: { id: "key-1" },
      }),
    );
    prismaMock.familyCredentialKey.upsert.mockResolvedValue({
      membershipId: "membership-1",
      keyVersion: 3,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await storeWrappedFamilyCredentialKey({
      userId: "owner-1",
      membershipId: "membership-1",
      wrappedKey: "wrapped",
    });

    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});

describe("deleteWrappedFamilyCredentialKey", () => {
  it("scopes deletion to the owner and membership", async () => {
    prismaMock.familyCredentialKey.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      deleteWrappedFamilyCredentialKey({
        userId: "owner-1",
        membershipId: "membership-1",
      }),
    ).resolves.toEqual({ success: true });

    expect(prismaMock.familyCredentialKey.deleteMany).toHaveBeenCalledWith({
      where: { membershipId: "membership-1", ownerId: "owner-1" },
    });
  });
});

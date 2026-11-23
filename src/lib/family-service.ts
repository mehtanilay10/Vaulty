/**
 * Family sharing database services.
 *
 * These functions contain the business rules for invitations, memberships and
 * shared read-only data. Route handlers stay thin and only deal with HTTP.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  buildFamilyInviteUrl,
  createFamilyInvitationToken,
  getFamilyInvitationExpiry,
  isFamilyInvitationExpired,
  sendFamilyInvitationAcceptedEmail,
  sendFamilyInvitationEmail,
} from "@/lib/family";
import { createNotification } from "@/lib/notifications";
import {
  familyModulesFromFlags,
  normalizeFamilyEmail,
  type FamilyInvitationSummary,
  type FamilyMembershipSummary,
  type FamilyModuleFlags,
  type FamilyOverview,
  type FamilyUserSummary,
} from "@/types/family";

export class FamilyServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "FamilyServiceError";
    this.code = code;
    this.status = status;
  }
}

type UserSelect = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

async function writeNotificationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    actionUrl?: string;
    idempotencyKey: string;
  },
) {
  await tx.notification.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      actionUrl: input.actionUrl ?? null,
      idempotencyKey: input.idempotencyKey,
      read: false,
    },
    update: {},
  });
}

function serializeUser(user: UserSelect | null | undefined): FamilyUserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

function serializeInvitation(invitation: {
  id: string;
  email: string;
  token?: string;
  status: string;
  shareDocuments: boolean;
  shareWealth: boolean;
  shareCredentials: boolean;
  shareReminders: boolean;
  shareNotes: boolean;
  expiresAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
  owner?: UserSelect | null;
}): FamilyInvitationSummary {
  return {
    id: invitation.id,
    email: invitation.email,
    status: invitation.status as FamilyInvitationSummary["status"],
    shareDocuments: invitation.shareDocuments,
    shareWealth: invitation.shareWealth,
    shareCredentials: invitation.shareCredentials,
    shareReminders: invitation.shareReminders,
    shareNotes: invitation.shareNotes,
    expiresAt: invitation.expiresAt.toISOString(),
    respondedAt: invitation.respondedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
    inviteUrl:
      invitation.token && invitation.status === "PENDING"
        ? buildFamilyInviteUrl(invitation.token)
        : null,
    owner: serializeUser(invitation.owner),
  };
}

function serializeMembership(membership: {
  id: string;
  ownerId: string;
  memberId: string;
  shareDocuments: boolean;
  shareWealth: boolean;
  shareCredentials: boolean;
  shareReminders: boolean;
  shareNotes: boolean;
  createdAt: Date;
  updatedAt: Date;
  owner?: UserSelect | null;
  member?:
    | (UserSelect & {
        passwordVault?: { familyPublicKey: string | null } | null;
      })
    | null;
  credentialKey?: { id: string } | null;
  memberHasFamilyPublicKey?: boolean;
}): FamilyMembershipSummary {
  return {
    id: membership.id,
    ownerId: membership.ownerId,
    memberId: membership.memberId,
    shareDocuments: membership.shareDocuments,
    shareWealth: membership.shareWealth,
    shareCredentials: membership.shareCredentials,
    shareReminders: membership.shareReminders,
    shareNotes: membership.shareNotes,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
    owner: serializeUser(membership.owner),
    member: serializeUser(membership.member),
    hasCredentialKey: !!membership.credentialKey,
    hasFamilyPublicKey:
      membership.memberHasFamilyPublicKey ?? !!membership.member?.passwordVault?.familyPublicKey,
  };
}

function flagData(flags: FamilyModuleFlags) {
  return {
    shareDocuments: flags.shareDocuments,
    shareWealth: flags.shareWealth,
    shareCredentials: flags.shareCredentials,
    shareReminders: flags.shareReminders,
    shareNotes: flags.shareNotes,
  };
}

function assertFlags(flags: FamilyModuleFlags) {
  if (familyModulesFromFlags(flags).length === 0) {
    throw new FamilyServiceError("NO_MODULES", "Select at least one module to share.", 400);
  }
}

export async function expireStaleFamilyInvitations(): Promise<number> {
  const result = await prisma.familyInvitation.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  return result.count;
}

export interface CreateFamilyInvitationInput {
  ownerId: string;
  email: string;
  flags: FamilyModuleFlags;
}

export async function createFamilyInvitation(input: CreateFamilyInvitationInput): Promise<{
  invitation: FamilyInvitationSummary;
  inviteUrl: string;
  emailSent: boolean;
}> {
  assertFlags(input.flags);

  const email = normalizeFamilyEmail(input.email);
  if (!email) {
    throw new FamilyServiceError("INVALID_EMAIL", "Enter a valid email address.", 400);
  }

  const owner = await prisma.user.findUnique({
    where: { id: input.ownerId },
    select: { id: true, name: true, email: true, image: true },
  });

  if (!owner) {
    throw new FamilyServiceError("OWNER_NOT_FOUND", "User not found.", 404);
  }

  if (owner.email && normalizeFamilyEmail(owner.email) === email) {
    throw new FamilyServiceError("SELF_INVITE", "You cannot invite yourself.", 400);
  }

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  if (existingUser) {
    if (existingUser.id === input.ownerId) {
      throw new FamilyServiceError("SELF_INVITE", "You cannot invite yourself.", 400);
    }

    const existingMembership = await prisma.familyMembership.findUnique({
      where: {
        ownerId_memberId: {
          ownerId: input.ownerId,
          memberId: existingUser.id,
        },
      },
      select: { id: true },
    });

    if (existingMembership) {
      throw new FamilyServiceError("ALREADY_MEMBER", "This person is already in your family.", 409);
    }
  }

  const existingInvitation = await prisma.familyInvitation.findUnique({
    where: { ownerId_email: { ownerId: input.ownerId, email } },
  });

  if (
    existingInvitation &&
    existingInvitation.status === "PENDING" &&
    !isFamilyInvitationExpired(existingInvitation.expiresAt)
  ) {
    // A retry after the invitation row was committed must not create a new
    // token or send duplicate mail. Repair the in-app notification idempotently.
    if (existingUser) {
      await createNotification({
        userId: existingUser.id,
        type: "FAMILY_INVITE",
        title: "Family invitation",
        message: "You have been invited to a family account.",
        metadata: { invitationId: existingInvitation.id },
        idempotencyKey: `family-invite:${existingInvitation.id}:${existingInvitation.token}`,
        actionUrl: `/family/accept?token=${encodeURIComponent(existingInvitation.token)}`,
      });
    }
    const inviteUrl = buildFamilyInviteUrl(existingInvitation.token);
    return { invitation: serializeInvitation(existingInvitation), inviteUrl, emailSent: false };
  }

  const token = createFamilyInvitationToken();
  const expiresAt = getFamilyInvitationExpiry();

  // Reuse the row for re-invites so the owner/email unique constraint stays
  // stable, but always issue a brand-new token.
  const invitation = await prisma.familyInvitation.upsert({
    where: { ownerId_email: { ownerId: input.ownerId, email } },
    create: {
      ownerId: input.ownerId,
      email,
      token,
      expiresAt,
      ...flagData(input.flags),
    },
    update: {
      token,
      status: "PENDING",
      expiresAt,
      respondedAt: null,
      ...flagData(input.flags),
    },
  });

  const inviteUrl = buildFamilyInviteUrl(token);
  const emailSent = await sendFamilyInvitationEmail({
    to: email,
    ownerName: owner.name || owner.email || "A Vaulty user",
    ownerEmail: owner.email || "",
    inviteUrl,
    flags: input.flags,
    expiresAt,
  });

  if (existingUser) {
    await createNotification({
      userId: existingUser.id,
      type: "FAMILY_INVITE",
      title: "Family invitation",
      message: "You have been invited to a family account.",
      metadata: { invitationId: invitation.id },
      idempotencyKey: `family-invite:${invitation.id}:${token}`,
      actionUrl: `/family/accept?token=${encodeURIComponent(token)}`,
    });
  }

  return {
    invitation: serializeInvitation(invitation),
    inviteUrl,
    emailSent,
  };
}

export async function getFamilyOverview(userId: string): Promise<FamilyOverview> {
  await expireStaleFamilyInvitations();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      passwordVault: {
        select: {
          isConfigured: true,
          familyPublicKey: true,
          familyEncryptedPrivateKey: true,
          familyPrivateKeyIv: true,
        },
      },
    },
  });

  const email = user?.email ? normalizeFamilyEmail(user.email) : "";

  const [ownedMemberships, receivedMemberships, sentInvitations, receivedInvitations] =
    await Promise.all([
      prisma.familyMembership.findMany({
        where: { ownerId: userId },
        include: {
          member: {
            select: {
              ...USER_SELECT,
              passwordVault: { select: { isConfigured: true, familyPublicKey: true } },
            },
          },
          credentialKey: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.familyMembership.findMany({
        where: { memberId: userId },
        include: {
          owner: { select: USER_SELECT },
          credentialKey: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.familyInvitation.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: "desc" },
      }),
      email
        ? prisma.familyInvitation.findMany({
            where: {
              email: { equals: email, mode: "insensitive" },
              status: "PENDING",
            },
            include: { owner: { select: USER_SELECT } },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

  const vault = user?.passwordVault;

  return {
    email: user?.email ?? null,
    hasVault: !!vault?.isConfigured,
    hasFamilyKey: !!(
      vault?.familyPublicKey &&
      vault.familyEncryptedPrivateKey &&
      vault.familyPrivateKeyIv
    ),
    ownedMemberships: ownedMemberships.map(serializeMembership),
    sentInvitations: sentInvitations.map(serializeInvitation),
    receivedMemberships: receivedMemberships.map(serializeMembership),
    receivedInvitations: receivedInvitations.map(serializeInvitation),
  };
}

async function findInvitationByToken(token: string) {
  return prisma.familyInvitation.findUnique({
    where: { token },
    include: {
      owner: { select: USER_SELECT },
    },
  });
}

function assertInvitationEmail(
  invitation: { email: string },
  userEmail: string | null | undefined,
) {
  if (!userEmail) {
    throw new FamilyServiceError(
      "EMAIL_MISMATCH",
      `Sign in with ${invitation.email} to respond to this invitation.`,
      403,
    );
  }

  const normalizedUserEmail = normalizeFamilyEmail(userEmail);
  const normalizedInvitationEmail = normalizeFamilyEmail(invitation.email);

  if (!timingSafeEqual(normalizedUserEmail, normalizedInvitationEmail)) {
    throw new FamilyServiceError(
      "EMAIL_MISMATCH",
      `Sign in with ${invitation.email} to respond to this invitation.`,
      403,
    );
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function assertPendingInvitation(invitation: { status: string; expiresAt: Date }) {
  if (invitation.status !== "PENDING") {
    throw new FamilyServiceError(
      "INVITATION_NOT_PENDING",
      "This invitation is no longer pending.",
      409,
    );
  }

  if (isFamilyInvitationExpired(invitation.expiresAt)) {
    throw new FamilyServiceError(
      "INVITATION_EXPIRED",
      "This invitation has expired. Ask the owner to send a new one.",
      410,
    );
  }
}

export async function getFamilyInvitationByToken(
  userId: string,
  userEmail: string | null | undefined,
  token: string,
) {
  const invitation = await findInvitationByToken(token);

  if (!invitation) {
    throw new FamilyServiceError("INVITATION_NOT_FOUND", "This invitation link is invalid.", 404);
  }

  if (invitation.status === "PENDING" && isFamilyInvitationExpired(invitation.expiresAt)) {
    await prisma.familyInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    invitation.status = "EXPIRED";
  }

  const emailMatches =
    !!userEmail && normalizeFamilyEmail(userEmail) === normalizeFamilyEmail(invitation.email);

  if (invitation.ownerId === userId) {
    throw new FamilyServiceError(
      "OWN_INVITATION",
      "This is your own invitation. Share the link with your family member.",
      400,
    );
  }

  return {
    invitation: serializeInvitation(invitation),
    emailMatches,
  };
}

export async function acceptFamilyInvitation(input: {
  userId: string;
  userEmail: string | null | undefined;
  token: string;
}) {
  const invitation = await findInvitationByToken(input.token);

  if (!invitation) {
    throw new FamilyServiceError("INVITATION_NOT_FOUND", "This invitation link is invalid.", 404);
  }

  if (invitation.ownerId === input.userId) {
    throw new FamilyServiceError("SELF_INVITE", "You cannot accept your own invitation.", 400);
  }

  assertInvitationEmail(invitation, input.userEmail);

  // Make acceptance retry-safe. If the DB commit succeeded but the HTTP
  // response/notification delivery failed, a retry repairs notifications
  // without creating a second membership or re-sending the acceptance email.
  if (invitation.status === "ACCEPTED") {
    const existingMembership = await prisma.familyMembership.findUnique({
      where: { ownerId_memberId: { ownerId: invitation.ownerId, memberId: input.userId } },
      include: { owner: { select: USER_SELECT }, member: { select: USER_SELECT } },
    });
    if (!existingMembership) {
      throw new FamilyServiceError(
        "INVITATION_NOT_PENDING",
        "This invitation has already been answered.",
        409,
      );
    }
    await createNotification({
      userId: invitation.ownerId,
      type: "FAMILY_INVITE_ACCEPTED",
      title: "Family invitation accepted",
      message: `${existingMembership.member?.name || existingMembership.member?.email || "Your family member"} accepted your invitation.`,
      metadata: { membershipId: existingMembership.id },
      idempotencyKey: `family-accepted-owner:${existingMembership.id}`,
      actionUrl: "/family",
    });
    await createNotification({
      userId: input.userId,
      type: "FAMILY_INVITE_ACCEPTED",
      title: "You joined a family",
      message: `You can now view the modules shared by ${existingMembership.owner?.name || existingMembership.owner?.email || "the owner"}.`,
      metadata: { membershipId: existingMembership.id },
      idempotencyKey: `family-accepted-member:${existingMembership.id}`,
      actionUrl: "/family",
    });
    return serializeMembership(existingMembership);
  }

  if (isFamilyInvitationExpired(invitation.expiresAt)) {
    await prisma.familyInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    throw new FamilyServiceError(
      "INVITATION_EXPIRED",
      "This invitation has expired. Ask the owner to send a new one.",
      410,
    );
  }

  assertPendingInvitation(invitation);

  const membership = await prisma.$transaction(async (tx) => {
    const updated = await tx.familyInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });

    if (updated.count === 0) {
      throw new FamilyServiceError(
        "INVITATION_NOT_PENDING",
        "This invitation has already been answered.",
        409,
      );
    }

    const existingMembership = await tx.familyMembership.findUnique({
      where: { ownerId_memberId: { ownerId: invitation.ownerId, memberId: input.userId } },
      include: { owner: { select: USER_SELECT }, member: { select: USER_SELECT } },
    });

    if (existingMembership) {
      await writeNotificationInTransaction(tx, {
        userId: invitation.ownerId,
        type: "FAMILY_INVITE_ACCEPTED",
        title: "Family invitation accepted",
        message: `${existingMembership.member?.name || existingMembership.member?.email || "Your family member"} accepted your invitation.`,
        metadata: { membershipId: existingMembership.id },
        idempotencyKey: `family-accepted-owner:${existingMembership.id}`,
        actionUrl: "/family",
      });
      await writeNotificationInTransaction(tx, {
        userId: input.userId,
        type: "FAMILY_INVITE_ACCEPTED",
        title: "You joined a family",
        message: `You can now view the modules shared by ${existingMembership.owner?.name || existingMembership.owner?.email || "the owner"}.`,
        metadata: { membershipId: existingMembership.id },
        idempotencyKey: `family-accepted-member:${existingMembership.id}`,
        actionUrl: "/family",
      });
      return existingMembership;
    }

    const acceptedMembership = await tx.familyMembership.create({
      data: { ownerId: invitation.ownerId, memberId: input.userId, ...flagData(invitation) },
      include: { owner: { select: USER_SELECT }, member: { select: USER_SELECT } },
    });
    await writeNotificationInTransaction(tx, {
      userId: invitation.ownerId,
      type: "FAMILY_INVITE_ACCEPTED",
      title: "Family invitation accepted",
      message: `${acceptedMembership.member?.name || acceptedMembership.member?.email || "Your family member"} accepted your invitation.`,
      metadata: { membershipId: acceptedMembership.id },
      idempotencyKey: `family-accepted-owner:${acceptedMembership.id}`,
      actionUrl: "/family",
    });
    await writeNotificationInTransaction(tx, {
      userId: input.userId,
      type: "FAMILY_INVITE_ACCEPTED",
      title: "You joined a family",
      message: `You can now view the modules shared by ${acceptedMembership.owner?.name || acceptedMembership.owner?.email || "the owner"}.`,
      metadata: { membershipId: acceptedMembership.id },
      idempotencyKey: `family-accepted-member:${acceptedMembership.id}`,
      actionUrl: "/family",
    });
    return acceptedMembership;
  });

  try {
    await createNotification({
      userId: invitation.ownerId,
      type: "FAMILY_INVITE_ACCEPTED",
      title: "Family invitation accepted",
      message: `${membership.member?.name || membership.member?.email || "Your family member"} accepted your invitation.`,
      metadata: { membershipId: membership.id },
      idempotencyKey: `family-accepted-owner:${membership.id}`,
      actionUrl: "/family",
    });
  } catch (err) {
    console.error(
      "[family-service] Failed to deliver owner push notification for accepted invite:",
      err,
    );
  }

  try {
    await createNotification({
      userId: input.userId,
      type: "FAMILY_INVITE_ACCEPTED",
      title: "You joined a family",
      message: `You can now view the modules shared by ${membership.owner?.name || membership.owner?.email || "the owner"}.`,
      metadata: { membershipId: membership.id },
      idempotencyKey: `family-accepted-member:${membership.id}`,
      actionUrl: "/family",
    });
  } catch (err) {
    console.error(
      "[family-service] Failed to deliver member push notification for accepted invite:",
      err,
    );
  }

  if (invitation.owner?.email) {
    try {
      await sendFamilyInvitationAcceptedEmail({
        to: invitation.owner.email,
        memberName: membership.member?.name || "",
        memberEmail: membership.member?.email || "",
      });
    } catch (err) {
      console.error("[family-service] Failed to send owner acceptance email:", err);
    }
  }

  return serializeMembership(membership);
}

export async function rejectFamilyInvitation(input: {
  userId: string;
  userEmail: string | null | undefined;
  token: string;
}) {
  const invitation = await findInvitationByToken(input.token);

  if (!invitation) {
    throw new FamilyServiceError("INVITATION_NOT_FOUND", "This invitation link is invalid.", 404);
  }

  if (invitation.ownerId === input.userId) {
    throw new FamilyServiceError("SELF_INVITE", "You cannot reject your own invitation.", 400);
  }

  assertInvitationEmail(invitation, input.userEmail);

  if (invitation.status === "REJECTED") {
    await createNotification({
      userId: invitation.ownerId,
      type: "FAMILY_INVITE_REJECTED",
      title: "Family invitation declined",
      message: `${invitation.email} declined your family invitation.`,
      metadata: { invitationId: invitation.id },
      idempotencyKey: `family-invite-rejected:${invitation.id}`,
      actionUrl: "/family",
    });
    return { success: true };
  }

  if (isFamilyInvitationExpired(invitation.expiresAt)) {
    await prisma.familyInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    throw new FamilyServiceError("INVITATION_EXPIRED", "This invitation has expired.", 410);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.familyInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "REJECTED", respondedAt: new Date() },
    });
    if (result.count === 0) return false;
    await writeNotificationInTransaction(tx, {
      userId: invitation.ownerId,
      type: "FAMILY_INVITE_REJECTED",
      title: "Family invitation declined",
      message: `${invitation.email} declined your family invitation.`,
      metadata: { invitationId: invitation.id },
      idempotencyKey: `family-invite-rejected:${invitation.id}`,
      actionUrl: "/family",
    });
    return true;
  });

  if (!updated) {
    const current = await prisma.familyInvitation.findUnique({
      where: { id: invitation.id },
      select: { status: true },
    });
    if (current?.status === "REJECTED") {
      await createNotification({
        userId: invitation.ownerId,
        type: "FAMILY_INVITE_REJECTED",
        title: "Family invitation declined",
        message: `${invitation.email} declined your family invitation.`,
        metadata: { invitationId: invitation.id },
        idempotencyKey: `family-invite-rejected:${invitation.id}`,
        actionUrl: "/family",
      });
      return { success: true };
    }
    throw new FamilyServiceError(
      "INVITATION_NOT_PENDING",
      "This invitation has already been answered.",
      409,
    );
  }

  await createNotification({
    userId: invitation.ownerId,
    type: "FAMILY_INVITE_REJECTED",
    title: "Family invitation declined",
    message: `${invitation.email} declined your family invitation.`,
    metadata: { invitationId: invitation.id },
    idempotencyKey: `family-invite-rejected:${invitation.id}`,
    actionUrl: "/family",
  });

  return { success: true };
}

export async function updateFamilyInvitation(input: {
  ownerId: string;
  invitationId: string;
  flags: FamilyModuleFlags;
}) {
  assertFlags(input.flags);

  const invitation = await prisma.familyInvitation.findFirst({
    where: { id: input.invitationId, ownerId: input.ownerId },
  });

  if (!invitation) {
    throw new FamilyServiceError("INVITATION_NOT_FOUND", "Invitation not found.", 404);
  }

  if (invitation.status !== "PENDING") {
    throw new FamilyServiceError(
      "INVITATION_NOT_PENDING",
      "Only pending invitations can be edited.",
      409,
    );
  }

  if (isFamilyInvitationExpired(invitation.expiresAt)) {
    await prisma.familyInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    throw new FamilyServiceError("INVITATION_EXPIRED", "This invitation has expired.", 410);
  }

  const updated = await prisma.familyInvitation.update({
    where: { id: invitation.id },
    data: flagData(input.flags),
  });

  return serializeInvitation(updated);
}

export async function cancelFamilyInvitation(input: { ownerId: string; invitationId: string }) {
  const updated = await prisma.familyInvitation.updateMany({
    where: {
      id: input.invitationId,
      ownerId: input.ownerId,
      status: "PENDING",
    },
    data: { status: "REVOKED", respondedAt: new Date() },
  });

  if (updated.count === 0) {
    throw new FamilyServiceError(
      "INVITATION_NOT_PENDING",
      "Only pending invitations can be cancelled.",
      409,
    );
  }

  return { success: true };
}

export async function resendFamilyInvitation(input: { ownerId: string; invitationId: string }) {
  const invitation = await prisma.familyInvitation.findFirst({
    where: { id: input.invitationId, ownerId: input.ownerId },
    include: { owner: { select: USER_SELECT } },
  });

  if (!invitation) {
    throw new FamilyServiceError("INVITATION_NOT_FOUND", "Invitation not found.", 404);
  }

  if (invitation.status !== "PENDING") {
    throw new FamilyServiceError(
      "INVITATION_NOT_PENDING",
      "Only pending invitations can be resent.",
      409,
    );
  }

  if (isFamilyInvitationExpired(invitation.expiresAt)) {
    await prisma.familyInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    throw new FamilyServiceError(
      "INVITATION_EXPIRED",
      "This invitation has expired. Create a new invitation instead.",
      410,
    );
  }

  const token = createFamilyInvitationToken();
  const expiresAt = getFamilyInvitationExpiry();

  const updated = await prisma.familyInvitation.update({
    where: { id: invitation.id },
    data: { token, expiresAt, respondedAt: null },
  });

  const inviteUrl = buildFamilyInviteUrl(token);
  const emailSent = await sendFamilyInvitationEmail({
    to: updated.email,
    ownerName: invitation.owner?.name || invitation.owner?.email || "A Vaulty user",
    ownerEmail: invitation.owner?.email || "",
    inviteUrl,
    flags: updated,
    expiresAt,
  });

  return {
    invitation: serializeInvitation(updated),
    inviteUrl,
    emailSent,
  };
}

export async function updateFamilyMembership(input: {
  ownerId: string;
  membershipId: string;
  flags: FamilyModuleFlags;
}) {
  assertFlags(input.flags);

  const membership = await prisma.familyMembership.findFirst({
    where: { id: input.membershipId, ownerId: input.ownerId },
    include: { member: { select: USER_SELECT } },
  });

  if (!membership) {
    throw new FamilyServiceError("MEMBERSHIP_NOT_FOUND", "Family member not found.", 404);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.familyMembership.update({
      where: { id: membership.id },
      data: flagData(input.flags),
      include: {
        owner: { select: USER_SELECT },
        member: { select: USER_SELECT },
        credentialKey: { select: { id: true } },
      },
    });

    // Removing credential access must also remove the wrapped decryption key.
    if (!input.flags.shareCredentials) {
      await tx.familyCredentialKey.deleteMany({ where: { membershipId: membership.id } });
    }
    await writeNotificationInTransaction(tx, {
      userId: membership.memberId,
      type: "FAMILY_SHARING_UPDATED",
      title: "Family sharing updated",
      message: `${membership.member?.name || "The owner"} updated the modules shared with you.`,
      metadata: { membershipId: membership.id, flags: input.flags },
      idempotencyKey: `family-sharing-updated:${membership.id}:${JSON.stringify(input.flags)}`,
      actionUrl: "/family",
    });
    return result;
  });

  await createNotification({
    userId: membership.memberId,
    type: "FAMILY_SHARING_UPDATED",
    title: "Family sharing updated",
    message: `${membership.member?.name || "The owner"} updated the modules shared with you.`,
    metadata: { membershipId: membership.id, flags: input.flags },
    idempotencyKey: `family-sharing-updated:${membership.id}:${JSON.stringify(input.flags)}`,
    actionUrl: "/family",
  });

  return serializeMembership(updated);
}

export async function revokeFamilyMembership(input: { ownerId: string; membershipId: string }) {
  const membership = await prisma.familyMembership.findFirst({
    where: { id: input.membershipId, ownerId: input.ownerId },
    include: { member: { select: USER_SELECT } },
  });

  if (!membership) {
    throw new FamilyServiceError("MEMBERSHIP_NOT_FOUND", "Family member not found.", 404);
  }

  await prisma.$transaction(async (tx) => {
    await writeNotificationInTransaction(tx, {
      userId: membership.memberId,
      type: "FAMILY_ACCESS_REVOKED",
      title: "Family access removed",
      message: `${membership.member?.name || "The owner"} removed your family access.`,
      metadata: { membershipId: membership.id },
      idempotencyKey: `family-revoked:${membership.id}`,
      actionUrl: "/family",
    });
    await tx.familyMembership.delete({ where: { id: membership.id } });
  });

  await createNotification({
    userId: membership.memberId,
    type: "FAMILY_ACCESS_REVOKED",
    title: "Family access removed",
    message: `${membership.member?.name || "The owner"} removed your family access.`,
    metadata: { membershipId: membership.id },
    idempotencyKey: `family-revoked:${membership.id}`,
    actionUrl: "/family",
  });

  return { success: true };
}

/* -------------------------------------------------------------------------- */
/* Shared read-only data                                                       */
/* -------------------------------------------------------------------------- */

export async function getFamilySharedDocuments(memberId: string, ownerId?: string) {
  const memberships = await prisma.familyMembership.findMany({
    where: {
      memberId,
      shareDocuments: true,
      ...(ownerId ? { ownerId } : {}),
    },
    include: {
      owner: { select: USER_SELECT },
    },
    orderBy: { createdAt: "desc" },
  });

  const ownerIds = memberships.map((membership) => membership.ownerId);

  const [folders, rootDocuments] = ownerIds.length
    ? await Promise.all([
        prisma.folder.findMany({
          where: { ownerId: { in: ownerIds }, parentId: null },
          include: {
            _count: { select: { documents: true, children: true } },
          },
          orderBy: { name: "asc" },
        }),
        prisma.document.findMany({
          where: {
            ownerId: { in: ownerIds },
            folder: { parentId: null },
          },
          select: {
            id: true,
            name: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            ownerId: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], []];

  return memberships.map((membership) => ({
    membershipId: membership.id,
    ownerId: membership.ownerId,
    owner: serializeUser(membership.owner),
    folders: folders
      .filter((folder) => folder.ownerId === membership.ownerId)
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        createdAt: folder.createdAt.toISOString(),
        documentCount: folder._count.documents,
        childCount: folder._count.children,
      })),
    documents: rootDocuments
      .filter((doc) => doc.ownerId === membership.ownerId)
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        createdAt: doc.createdAt.toISOString(),
      })),
  }));
}

export async function getFamilySharedWealth(memberId: string, ownerId?: string) {
  const memberships = await prisma.familyMembership.findMany({
    where: {
      memberId,
      shareWealth: true,
      ...(ownerId ? { ownerId } : {}),
    },
    include: {
      owner: { select: USER_SELECT },
    },
    orderBy: { createdAt: "desc" },
  });

  const ownerIds = memberships.map((membership) => membership.ownerId);

  const accounts = ownerIds.length
    ? await prisma.wealthAccount.findMany({
        where: { ownerId: { in: ownerIds } },
        include: {
          _count: { select: { transactions: true } },
          transactions: {
            orderBy: { date: "desc" },
            take: 5,
          },
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  const { withoutPin } = await import("@/lib/wealth");

  return memberships.map((membership) => ({
    membershipId: membership.id,
    ownerId: membership.ownerId,
    owner: serializeUser(membership.owner),
    accounts: accounts
      .filter((account) => account.ownerId === membership.ownerId)
      .map((account) => withoutPin(account)),
  }));
}

export async function getFamilySharedReminders(memberId: string, ownerId?: string) {
  const memberships = await prisma.familyMembership.findMany({
    where: {
      memberId,
      shareReminders: true,
      ...(ownerId ? { ownerId } : {}),
    },
    include: {
      owner: { select: USER_SELECT },
    },
    orderBy: { createdAt: "desc" },
  });

  const ownerIds = memberships.map((membership) => membership.ownerId);

  const reminders = ownerIds.length
    ? await prisma.reminder.findMany({
        where: {
          userId: { in: ownerIds },
          isActive: true,
          isCompleted: false,
        },
        orderBy: { dueAt: "asc" },
      })
    : [];

  return memberships.map((membership) => ({
    membershipId: membership.id,
    ownerId: membership.ownerId,
    owner: serializeUser(membership.owner),
    reminders: reminders
      .filter((r) => r.userId === membership.ownerId)
      .map((r) => ({
        ...r,
        dueAt: r.dueAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
  }));
}

export async function getFamilySharedNotes(memberId: string, ownerId?: string) {
  const memberships = await prisma.familyMembership.findMany({
    where: {
      memberId,
      shareNotes: true,
      ...(ownerId ? { ownerId } : {}),
    },
    include: {
      owner: { select: USER_SELECT },
    },
    orderBy: { createdAt: "desc" },
  });

  const ownerIds = memberships.map((membership) => membership.ownerId);

  const notes = ownerIds.length
    ? await prisma.notePage.findMany({
        where: {
          userId: { in: ownerIds },
          isArchived: false,
        },
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      })
    : [];

  return memberships.map((membership) => ({
    membershipId: membership.id,
    ownerId: membership.ownerId,
    owner: serializeUser(membership.owner),
    notes: notes
      .filter((n) => n.userId === membership.ownerId)
      .map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
  }));
}

export async function getFamilySharedCredentials(memberId: string, ownerId?: string) {
  const memberships = await prisma.familyMembership.findMany({
    where: {
      memberId,
      shareCredentials: true,
      ...(ownerId ? { ownerId } : {}),
    },
    include: {
      owner: {
        select: {
          ...USER_SELECT,
          passwordVault: { select: { id: true } },
        },
      },
      credentialKey: {
        select: { wrappedKey: true, keyVersion: true, updatedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const vaultIds = memberships
    .map((membership) => membership.owner?.passwordVault?.id)
    .filter((vaultId): vaultId is string => !!vaultId);

  const [apps, banks] = vaultIds.length
    ? await Promise.all([
        prisma.appCredential.findMany({
          where: { vaultId: { in: vaultIds } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.bankCredential.findMany({
          where: { vaultId: { in: vaultIds } },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], []];

  return memberships.map((membership) => {
    const vaultId = membership.owner?.passwordVault?.id ?? null;
    const hasKey = !!membership.credentialKey?.wrappedKey;

    return {
      membershipId: membership.id,
      owner: serializeUser(membership.owner),
      vaultId,
      wrappedKey: hasKey ? (membership.credentialKey?.wrappedKey ?? null) : null,
      keyVersion: membership.credentialKey?.keyVersion ?? null,
      keyUpdatedAt: membership.credentialKey?.updatedAt.toISOString() ?? null,
      // Never send ciphertext that the member cannot decrypt. This also makes
      // the "waiting for the owner's key" state explicit in the UI.
      // Strict Security Boundary: Family members must NEVER receive the owner's 2FA TOTP secret or codes!
      appCredentials:
        hasKey && vaultId
          ? apps
              .filter((credential) => credential.vaultId === vaultId)
              .map((credential) => ({
                ...credential,
                totpSecret: null,
              }))
          : [],
      bankCredentials:
        hasKey && vaultId ? banks.filter((credential) => credential.vaultId === vaultId) : [],
    };
  });
}

export async function getFamilyCredentialKeyStatus(userId: string) {
  const [vault, ownedMemberships, receivedMemberships] = await Promise.all([
    prisma.passwordVault.findUnique({
      where: { userId },
      select: {
        isConfigured: true,
        familyPublicKey: true,
        familyEncryptedPrivateKey: true,
        familyPrivateKeyIv: true,
        familyKeyUpdatedAt: true,
      },
    }),
    prisma.familyMembership.findMany({
      where: { ownerId: userId, shareCredentials: true },
      include: {
        member: {
          select: {
            ...USER_SELECT,
            passwordVault: {
              select: { isConfigured: true, familyPublicKey: true },
            },
          },
        },
        credentialKey: { select: { id: true, updatedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.familyMembership.findMany({
      where: { memberId: userId, shareCredentials: true },
      include: {
        owner: { select: USER_SELECT },
        credentialKey: { select: { id: true, updatedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    hasVault: !!vault?.isConfigured,
    key: vault?.familyPublicKey
      ? {
          publicKey: vault.familyPublicKey,
          encryptedPrivateKey: vault.familyEncryptedPrivateKey,
          privateKeyIv: vault.familyPrivateKeyIv,
          updatedAt: vault.familyKeyUpdatedAt?.toISOString() ?? null,
        }
      : null,
    owned: ownedMemberships.map((membership) => ({
      membershipId: membership.id,
      member: serializeUser(membership.member),
      memberPublicKey: membership.member?.passwordVault?.isConfigured
        ? membership.member.passwordVault.familyPublicKey
        : null,
      hasWrappedKey: !!membership.credentialKey,
      wrappedKeyUpdatedAt: membership.credentialKey?.updatedAt.toISOString() ?? null,
    })),
    received: receivedMemberships.map((membership) => ({
      membershipId: membership.id,
      owner: serializeUser(membership.owner),
      hasWrappedKey: !!membership.credentialKey,
      wrappedKeyUpdatedAt: membership.credentialKey?.updatedAt.toISOString() ?? null,
    })),
  };
}

function requireKeyString(value: unknown, field: string, maxLength = 20000) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new FamilyServiceError("INVALID_KEY_MATERIAL", `Invalid ${field}.`, 400);
  }
  return value;
}

export async function registerFamilyCredentialKey(input: {
  userId: string;
  publicKey: unknown;
  encryptedPrivateKey: unknown;
  privateKeyIv: unknown;
}) {
  const vault = await prisma.passwordVault.findUnique({
    where: { userId: input.userId },
    select: { id: true, isConfigured: true, familyPublicKey: true },
  });
  if (!vault?.isConfigured) {
    throw new FamilyServiceError(
      "VAULT_NOT_FOUND",
      "Set up your credential vault before sharing credentials.",
      404,
    );
  }

  const publicKey = requireKeyString(input.publicKey, "public key");
  const encryptedPrivateKey = requireKeyString(
    input.encryptedPrivateKey,
    "encrypted private key",
    40000,
  );
  const privateKeyIv = requireKeyString(input.privateKeyIv, "private key IV", 256);
  const publicKeyChanged = vault.familyPublicKey !== publicKey;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.passwordVault.update({
      where: { id: vault.id },
      data: {
        familyPublicKey: publicKey,
        familyEncryptedPrivateKey: encryptedPrivateKey,
        familyPrivateKeyIv: privateKeyIv,
        familyKeyUpdatedAt: new Date(),
      },
      select: {
        familyPublicKey: true,
        familyEncryptedPrivateKey: true,
        familyPrivateKeyIv: true,
        familyKeyUpdatedAt: true,
      },
    });

    if (publicKeyChanged) {
      const memberships =
        (await tx.familyMembership.findMany({
          where: { memberId: input.userId, shareCredentials: true },
          select: { id: true, ownerId: true },
        })) || [];
      await tx.familyCredentialKey.deleteMany({ where: { memberId: input.userId } });
      for (const membership of memberships) {
        await writeNotificationInTransaction(tx, {
          userId: membership.ownerId,
          type: "FAMILY_CREDENTIAL_KEY_ROTATED",
          title: "Family credential key changed",
          message:
            "A family member updated their encryption key. Re-share credentials to restore their access.",
          metadata: { membershipId: membership.id, memberId: input.userId },
          idempotencyKey: `family-credential-key-rotated:${membership.id}:${result.familyKeyUpdatedAt?.getTime() ?? Date.now()}`,
          actionUrl: "/family",
        });
      }
    }
    return result;
  });

  return {
    publicKey: updated.familyPublicKey,
    encryptedPrivateKey: updated.familyEncryptedPrivateKey,
    privateKeyIv: updated.familyPrivateKeyIv,
    updatedAt: updated.familyKeyUpdatedAt?.toISOString() ?? null,
  };
}

export async function storeWrappedFamilyCredentialKey(input: {
  userId: string;
  membershipId: string;
  wrappedKey: unknown;
}) {
  const wrappedKey = requireKeyString(input.wrappedKey, "wrapped key", 40000);

  const membership = await prisma.familyMembership.findFirst({
    where: {
      id: input.membershipId,
      ownerId: input.userId,
      shareCredentials: true,
    },
    include: {
      member: {
        select: {
          passwordVault: { select: { isConfigured: true, familyPublicKey: true } },
        },
      },
      credentialKey: { select: { id: true } },
    },
  });

  if (!membership) {
    throw new FamilyServiceError(
      "MEMBERSHIP_NOT_FOUND",
      "Credential sharing is not enabled for this family member.",
      404,
    );
  }

  if (!membership.member?.passwordVault?.familyPublicKey) {
    throw new FamilyServiceError(
      "MEMBER_KEY_MISSING",
      "This family member has not set up secure credential sharing yet.",
      409,
    );
  }

  const key = await prisma.$transaction(async (tx) => {
    const stored = await tx.familyCredentialKey.upsert({
      where: { membershipId: membership.id },
      create: {
        membershipId: membership.id,
        ownerId: membership.ownerId,
        memberId: membership.memberId,
        wrappedKey,
      },
      update: { wrappedKey, keyVersion: { increment: 1 } },
    });
    if (!membership.credentialKey) {
      await writeNotificationInTransaction(tx, {
        userId: membership.memberId,
        type: "FAMILY_CREDENTIAL_KEY_SHARED",
        title: "Credentials shared securely",
        message: "The credential key for your family account is ready.",
        metadata: { membershipId: membership.id, keyVersion: stored.keyVersion },
        idempotencyKey: `family-credential-key-shared:${membership.id}:${stored.keyVersion}`,
        actionUrl: "/family/credentials",
      });
    }
    return stored;
  });

  if (!membership.credentialKey) {
    await createNotification({
      userId: membership.memberId,
      type: "FAMILY_CREDENTIAL_KEY_SHARED",
      title: "Credentials shared securely",
      message: "The credential key for your family account is ready.",
      metadata: { membershipId: membership.id, keyVersion: key.keyVersion },
      idempotencyKey: `family-credential-key-shared:${membership.id}:${key.keyVersion}`,
      actionUrl: "/family/credentials",
    });
  }

  return {
    membershipId: key.membershipId,
    keyVersion: key.keyVersion,
    updatedAt: key.updatedAt.toISOString(),
  };
}

export async function deleteWrappedFamilyCredentialKey(input: {
  userId: string;
  membershipId: string;
}) {
  const deleted = await prisma.familyCredentialKey.deleteMany({
    where: {
      membershipId: input.membershipId,
      ownerId: input.userId,
    },
  });

  return { success: deleted.count > 0 };
}

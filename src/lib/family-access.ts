/**
 * Database-backed family access checks.
 *
 * A family relationship is only active once an invitation has been accepted
 * and a `FamilyMembership` exists. Revoking that membership therefore blocks
 * access on the very next request, without relying on session invalidation.
 */

import { prisma } from "@/lib/prisma";
import type { FamilyModule } from "@/types/family";

export const FAMILY_MODULE_FIELD = {
  documents: "shareDocuments",
  wealth: "shareWealth",
  credentials: "shareCredentials",
  reminders: "shareReminders",
  notes: "shareNotes",
} as const;

export interface FamilyMembershipAccess {
  membershipId: string;
  ownerId: string;
  shareDocuments: boolean;
  shareWealth: boolean;
  shareCredentials: boolean;
  shareReminders: boolean;
  shareNotes: boolean;
}

export type FamilyAccessDenialReason = "NOT_FOUND" | "MODULE_NOT_SHARED";

export interface FamilyModuleAccessResult {
  hasAccess: boolean;
  membership: FamilyMembershipAccess | null;
  reason?: FamilyAccessDenialReason;
}

export function familyMembershipAllowsModule(
  membership: Pick<
    FamilyMembershipAccess,
    "shareDocuments" | "shareWealth" | "shareCredentials" | "shareReminders" | "shareNotes"
  >,
  module: FamilyModule,
): boolean {
  return membership[FAMILY_MODULE_FIELD[module]] === true;
}

export async function getFamilyMembershipForOwner(memberId: string, ownerId: string) {
  if (!memberId || !ownerId || memberId === ownerId) return null;

  const membership = await prisma.familyMembership.findUnique({
    where: { ownerId_memberId: { ownerId, memberId } },
    select: {
      id: true,
      ownerId: true,
      memberId: true,
      shareDocuments: true,
      shareWealth: true,
      shareCredentials: true,
      shareReminders: true,
      shareNotes: true,
    },
  });

  if (!membership) return null;

  return {
    membershipId: membership.id,
    ownerId: membership.ownerId,
    memberId: membership.memberId,
    shareDocuments: membership.shareDocuments,
    shareWealth: membership.shareWealth,
    shareCredentials: membership.shareCredentials,
    shareReminders: membership.shareReminders,
    shareNotes: membership.shareNotes,
  };
}

export async function checkFamilyModuleAccess(
  memberId: string,
  ownerId: string,
  module: FamilyModule,
): Promise<FamilyModuleAccessResult> {
  const membership = await getFamilyMembershipForOwner(memberId, ownerId);

  if (!membership) {
    return { hasAccess: false, membership: null, reason: "NOT_FOUND" };
  }

  if (!familyMembershipAllowsModule(membership, module)) {
    return { hasAccess: false, membership, reason: "MODULE_NOT_SHARED" };
  }

  return { hasAccess: true, membership };
}

export async function hasFamilyModuleAccess(
  memberId: string,
  ownerId: string,
  module: FamilyModule,
): Promise<boolean> {
  const result = await checkFamilyModuleAccess(memberId, ownerId, module);
  return result.hasAccess;
}

/**
 * Return the active family owners that share at least one module with the
 * member. Used by the Family page and the shared module pages.
 */
export async function getFamilyMembershipsForMember(memberId: string, module?: FamilyModule) {
  return prisma.familyMembership.findMany({
    where: {
      memberId,
      ...(module ? { [FAMILY_MODULE_FIELD[module]]: true } : {}),
    },
    include: {
      owner: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFamilyMembershipsOwnedBy(ownerId: string) {
  return prisma.familyMembership.findMany({
    where: { ownerId },
    include: {
      member: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

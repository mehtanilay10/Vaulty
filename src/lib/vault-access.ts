/**
 * Vault access control for shared vaults.
 * Returns the caller's access level to a password vault.
 */

import { prisma } from "@/lib/prisma";

export type VaultPermission = "OWNER" | "READ_ONLY" | "FULL_ACCESS" | "NONE";

/** Permissions that may be stored on a share. OWNER/NONE are derived states. */
const SHARE_PERMISSIONS = ["READ_ONLY", "FULL_ACCESS"] as const;
type SharePermission = (typeof SHARE_PERMISSIONS)[number];

function isSharePermission(val: unknown): val is SharePermission {
  return typeof val === "string" && (SHARE_PERMISSIONS as readonly string[]).includes(val);
}

function normalizeSharePermission(permission: unknown): VaultPermission {
  // Unknown database values must never be treated as elevated access.
  if (isSharePermission(permission)) {
    return permission;
  }
  return "READ_ONLY";
}

export interface VaultAccessResult {
  hasAccess: boolean;
  isOwner: boolean;
  permission: VaultPermission;
}

export async function getVaultAccess(userId: string, vaultId: string): Promise<VaultAccessResult> {
  const vault = await prisma.passwordVault.findUnique({
    where: { id: vaultId },
    select: { id: true, userId: true },
  });

  if (!vault) {
    return { hasAccess: false, isOwner: false, permission: "NONE" };
  }

  if (vault.userId === userId) {
    return { hasAccess: true, isOwner: true, permission: "OWNER" };
  }

  const share = await prisma.vaultShare.findFirst({
    where: { vaultId, sharedWithId: userId },
    select: { permission: true },
  });

  if (!share) {
    return { hasAccess: false, isOwner: false, permission: "NONE" };
  }

  return {
    hasAccess: true,
    isOwner: false,
    permission: normalizeSharePermission(share.permission),
  };
}

export async function getUserVaults(userId: string) {
  const [owned, shared] = await Promise.all([
    prisma.passwordVault.findMany({
      where: { userId },
      select: { id: true, userId: true, createdAt: true },
    }),
    prisma.vaultShare.findMany({
      where: { sharedWithId: userId },
      include: {
        vault: {
          select: { id: true, userId: true, createdAt: true },
        },
      },
    }),
  ]);

  return {
    owned,
    shared: shared.map((s) => ({
      ...s.vault,
      permission: normalizeSharePermission(s.permission),
      sharedById: s.sharedById,
    })),
  };
}

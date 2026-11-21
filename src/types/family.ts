/**
 * Shared Family Sharing types and pure helpers.
 *
 * This module intentionally has no server or browser dependencies so it can be
 * imported from route handlers, server components, client components and tests.
 */

export type FamilyModule = "documents" | "wealth" | "credentials" | "reminders";

export interface FamilyModuleFlags {
  shareDocuments: boolean;
  shareWealth: boolean;
  shareCredentials: boolean;
  shareReminders: boolean;
}

export type FamilyInvitationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "REVOKED" | "EXPIRED";

export const FAMILY_MODULES: FamilyModule[] = ["documents", "wealth", "credentials", "reminders"];

export const FAMILY_MODULE_LABELS: Record<FamilyModule, string> = {
  documents: "Documents",
  wealth: "Wealth",
  credentials: "Credentials",
  reminders: "Reminders",
};

export const FAMILY_MODULE_DESCRIPTIONS: Record<FamilyModule, string> = {
  documents: "Browse the owner's document folders and download files (read-only).",
  wealth: "View the owner's wealth accounts, balances and transactions (read-only).",
  credentials: "View the owner's app and bank credentials (read-only, end-to-end encrypted).",
  reminders: "View upcoming bill payment due dates, renewals and task reminders (read-only).",
};

export const FAMILY_MODULE_FIELD: Record<FamilyModule, keyof FamilyModuleFlags> = {
  documents: "shareDocuments",
  wealth: "shareWealth",
  credentials: "shareCredentials",
  reminders: "shareReminders",
};

export function emptyFamilyModuleFlags(): FamilyModuleFlags {
  return {
    shareDocuments: false,
    shareWealth: false,
    shareCredentials: false,
    shareReminders: false,
  };
}

export function normalizeFamilyEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidFamilyEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Parse module flags from an untrusted request body. Returns null when no
 * module is selected, so callers can reject the request.
 */
export function parseFamilyModuleFlags(value: unknown): FamilyModuleFlags | null {
  if (!value || typeof value !== "object") return null;

  const input = value as Record<string, unknown>;
  const flags: FamilyModuleFlags = {
    shareDocuments: input.shareDocuments === true,
    shareWealth: input.shareWealth === true,
    shareCredentials: input.shareCredentials === true,
    shareReminders: input.shareReminders === true,
  };

  return hasAnyFamilyModule(flags) ? flags : null;
}

export function hasAnyFamilyModule(flags: FamilyModuleFlags): boolean {
  if (!flags) return false;
  return Boolean(
    flags.shareDocuments || flags.shareWealth || flags.shareCredentials || flags.shareReminders,
  );
}

export function familyModulesFromFlags(flags: FamilyModuleFlags): FamilyModule[] {
  if (!flags) return [];
  return FAMILY_MODULES.filter((module) => Boolean(flags[FAMILY_MODULE_FIELD[module]]));
}

export function isFamilyModuleShared(flags: FamilyModuleFlags, module: FamilyModule): boolean {
  if (!flags || !module) return false;
  const field = FAMILY_MODULE_FIELD[module];
  return Boolean(field && flags[field] === true);
}

export function familyModuleLabels(flags: FamilyModuleFlags): string[] {
  return familyModulesFromFlags(flags).map((module) => FAMILY_MODULE_LABELS[module]);
}

export interface FamilyUserSummary {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface FamilyMembershipSummary extends FamilyModuleFlags {
  id: string;
  ownerId: string;
  memberId: string;
  createdAt: string;
  updatedAt: string;
  owner?: FamilyUserSummary | null;
  member?: FamilyUserSummary | null;
  hasCredentialKey?: boolean;
  hasFamilyPublicKey?: boolean;
}

export interface FamilyInvitationSummary extends FamilyModuleFlags {
  id: string;
  email: string;
  status: FamilyInvitationStatus;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  inviteUrl?: string | null;
  owner?: FamilyUserSummary | null;
}

export interface FamilyOverview {
  email: string | null;
  hasVault: boolean;
  hasFamilyKey: boolean;
  ownedMemberships: FamilyMembershipSummary[];
  sentInvitations: FamilyInvitationSummary[];
  receivedMemberships: FamilyMembershipSummary[];
  receivedInvitations: FamilyInvitationSummary[];
}

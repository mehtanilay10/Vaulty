/**
 * Family sharing helpers: invitation tokens, expiry windows and email.
 *
 * This module is server-only (it imports Node's crypto module). Pure
 * invitation/module helpers live in `src/types/family.ts` so they can be
 * shared with client components and tests.
 */

import { randomBytes } from "crypto";
import {
  FAMILY_MODULE_DESCRIPTIONS,
  familyModulesFromFlags,
  FAMILY_MODULE_LABELS,
  type FamilyModuleFlags,
} from "@/types/family";

export const FAMILY_INVITATION_TTL_DAYS = 7;
export const FAMILY_INVITATION_TTL_MS = FAMILY_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

export function createFamilyInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getFamilyInvitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + FAMILY_INVITATION_TTL_MS);
}

export function isFamilyInvitationExpired(
  expiresAt: Date | string,
  now: Date = new Date(),
): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime();
}

import { getAppBaseUrl } from "@/lib/url";
import { escapeHtml } from "@/lib/utils";
export { getAppBaseUrl };

export function buildFamilyInviteUrl(token: string): string {
  return `${getAppBaseUrl()}/family/accept?token=${encodeURIComponent(token)}`;
}

function modulesTable(flags: FamilyModuleFlags): string {
  const modules = familyModulesFromFlags(flags);
  if (modules.length === 0) {
    return "<p><strong>No modules selected.</strong></p>";
  }

  const rows = modules
    .map(
      (module) =>
        `<tr><td style="padding:6px 12px 6px 0;"><strong>${FAMILY_MODULE_LABELS[module]}</strong></td><td style="padding:6px 0;">${FAMILY_MODULE_DESCRIPTIONS[module]}</td></tr>`,
    )
    .join("");

  return `<table style="border-collapse:collapse;font-size:14px;">${rows}</table>`;
}

export interface SendFamilyInviteEmailOptions {
  to: string;
  ownerName: string;
  ownerEmail: string;
  inviteUrl: string;
  flags: FamilyModuleFlags;
  expiresAt: Date;
}

/**
 * Send a family invitation email. Returns false when the mail provider is not
 * configured or the send fails; callers surface the invite link so the owner
 * can share it manually.
 */
export async function sendFamilyInvitationEmail(
  options: SendFamilyInviteEmailOptions,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    return false;
  }

  try {
    const { sendEmail } = await import("@/lib/email");
    const owner = escapeHtml(options.ownerName || options.ownerEmail);
    const expires = options.expiresAt.toISOString().slice(0, 10);

    await sendEmail({
      to: options.to,
      subject: `${owner} invited you to their Vaulty family`,
      html: `
        <h2>You're invited to a Vaulty family</h2>
        <p>${owner} invited you to view selected parts of their Vaulty account. Family access is always read-only.</p>
        ${modulesTable(options.flags)}
        <p style="margin-top:20px;">
          <a href="${escapeHtml(options.inviteUrl)}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;">
            Accept invitation
          </a>
        </p>
        <p>This invitation expires on ${expires}.</p>
        <p>Sign in to Vaulty with <strong>${escapeHtml(options.to)}</strong> to accept it. If you were not expecting this invitation you can safely ignore it.</p>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send family invitation email:", error);
    return false;
  }
}

export async function sendFamilyInvitationAcceptedEmail(options: {
  to: string;
  memberName: string;
  memberEmail: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { sendEmail } = await import("@/lib/email");
    const member = escapeHtml(options.memberName || options.memberEmail);
    await sendEmail({
      to: options.to,
      subject: `${member} accepted your Vaulty family invitation`,
      html: `
        <h2>Family invitation accepted</h2>
        <p>${member} accepted your family invitation. You can manage exactly which modules they can view from the Family page.</p>
        <p><a href="${escapeHtml(`${getAppBaseUrl()}/family`)}">Open Family settings</a></p>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send family acceptance email:", error);
    return false;
  }
}

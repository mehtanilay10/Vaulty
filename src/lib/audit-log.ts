import { prisma } from "@/lib/prisma";

/**
 * Security audit log helper for sensitive actions
 * Logs user actions with context for security auditing
 */

export type AuditAction =
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "USER_REGISTER"
  | "USER_UPDATE_PROFILE"
  | "USER_DELETE_ACCOUNT"
  | "DOCUMENT_UPLOAD"
  | "DOCUMENT_DELETE"
  | "DOCUMENT_SHARE"
  | "DOCUMENT_UNSHARE"
  | "DOCUMENT_VIEW"
  | "FOLDER_CREATE"
  | "FOLDER_DELETE"
  | "FOLDER_SHARE"
  | "FOLDER_UNSHARE"
  | "VAULT_CREATE"
  | "VAULT_UNLOCK"
  | "VAULT_LOCK"
  | "VAULT_SHARE"
  | "VAULT_UNSHARE"
  | "CREDENTIAL_CREATE"
  | "CREDENTIAL_UPDATE"
  | "CREDENTIAL_DELETE"
  | "CREDENTIAL_VIEW"
  | "MASTER_PASSWORD_CHANGE"
  | "MASTER_PASSWORD_RESET"
  | "WEALTH_ACCOUNT_CREATE"
  | "WEALTH_ACCOUNT_UPDATE"
  | "WEALTH_ACCOUNT_DELETE"
  | "WEALTH_ACCOUNT_MERGE"
  | "WEALTH_TRANSACTION_CREATE"
  | "WEALTH_TRANSACTION_UPDATE"
  | "WEALTH_TRANSACTION_DELETE"
  | "GOOGLE_DRIVE_CONNECT"
  | "GOOGLE_DRIVE_DISCONNECT"
  | "GOOGLE_DRIVE_SYNC"
  | "GMAIL_CONNECT"
  | "GMAIL_DISCONNECT"
  | "GMAIL_SYNC"
  | "GMAIL_TRANSACTION_IMPORT"
  | "OUTLOOK_CONNECT"
  | "OUTLOOK_DISCONNECT"
  | "OUTLOOK_SYNC"
  | "OUTLOOK_TRANSACTION_IMPORT"
  | "EMAIL_TRANSACTION_IMPORT"
  | "EMAIL_TRANSACTION_AUTO_IMPORT"
  | "EMAIL_DOCUMENT_IMPORT"
  | "EMAIL_REMINDER_IMPORT"
  | "INBOUND_EMAIL_PROCESSED"
  | "INBOUND_EMAIL_SETTINGS_UPDATED"
  | "SHARE_LINK_CREATE"
  | "SHARE_LINK_ACCESS"
  | "SHARE_LINK_REVOKE"
  | "AI_JOB_QUEUE"
  | "AI_JOB_COMPLETE"
  | "AI_JOB_FAIL"
  | "SESSION_INVALIDATED"
  | "FAMILY_INVITE"
  | "FAMILY_INVITE_RESEND"
  | "FAMILY_INVITE_CANCEL"
  | "FAMILY_INVITE_UPDATE"
  | "FAMILY_INVITE_ACCEPT"
  | "FAMILY_INVITE_REJECT"
  | "FAMILY_MEMBERSHIP_UPDATE"
  | "FAMILY_MEMBERSHIP_REVOKE"
  | "FAMILY_CREDENTIAL_KEY_UPDATE";

export interface AuditLogOptions {
  userId: string;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  documentId?: string;
  folderId?: string;
  vaultId?: string;
  credentialId?: string;
  accountId?: string;
}

export type AuditFailureHandler = (error: unknown, options: AuditLogOptions) => void;
let auditFailureHandler: AuditFailureHandler | null = null;

export function setAuditFailureHandler(handler: AuditFailureHandler | null): void {
  auditFailureHandler = handler;
}

/**
 * Create a security audit log entry
 */
export async function createAuditLog(options: AuditLogOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: options.userId,
        action: options.action,
        metadata: options.metadata ? JSON.stringify(options.metadata) : null,
        documentId: options.documentId,
        folderId: options.folderId,
      },
    });
  } catch (error) {
    console.error(
      `[SECURITY ALERT] Audit log creation failed for action "${options.action}" (user: ${options.userId}):`,
      error,
    );
    try {
      auditFailureHandler?.(error, options);
    } catch (handlerErr) {
      console.error("[audit-log] Failure monitoring handler threw an error:", handlerErr);
    }
    // Don't throw - audit log failure shouldn't break the main user operation
  }
}

const MAX_IP_ADDRESS_LENGTH = 45;
const MAX_USER_AGENT_LENGTH = 512;
// Permitted characters for IPv4/IPv6 literals, including zone identifiers.
const IP_ADDRESS_PATTERN = /^[0-9A-Fa-f:.%[\]]+$/;

/**
 * Sanitize a client-supplied IP address before persisting it in an audit log.
 * Values that are too long or contain unexpected characters are discarded so
 * untrusted headers cannot inject arbitrary content into the database.
 */
export function sanitizeIpAddress(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > MAX_IP_ADDRESS_LENGTH) return "unknown";
  return IP_ADDRESS_PATTERN.test(trimmed) ? trimmed : "unknown";
}

/**
 * Strip control characters, collapse whitespace, and truncate a client-supplied
 * user agent before persisting it in an audit log.
 */
export function sanitizeUserAgent(value: string | null | undefined): string {
  if (!value) return "unknown";
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, MAX_USER_AGENT_LENGTH) : "unknown";
}

/**
 * Extract a sanitized IP address from request headers
 */
export function extractIpAddress(req: Request): string {
  return sanitizeIpAddress(
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip"),
  );
}

/**
 * Extract a sanitized user agent from request headers
 */
export function extractUserAgent(req: Request): string {
  return sanitizeUserAgent(req.headers.get("user-agent"));
}

/**
 * Log credential vault actions (uses PasswordAuditLog)
 */
export async function createPasswordAuditLog(options: {
  vaultId: string;
  action: string;
  credentialType?: string;
  credentialId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.passwordAuditLog.create({
      data: {
        vaultId: options.vaultId,
        action: options.action,
        credentialType: options.credentialType,
        credentialId: options.credentialId,
        metadata: options.metadata ? JSON.stringify(options.metadata) : null,
        ipAddress: sanitizeIpAddress(options.ipAddress),
        userAgent: sanitizeUserAgent(options.userAgent),
      },
    });
  } catch (error) {
    console.error("Failed to create password audit log:", error);
  }
}

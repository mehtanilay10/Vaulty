import { prisma } from "@/lib/prisma";
import { createAuthorizedGmail, decryptGmailRefreshToken } from "@/lib/gmail/oauth";
import { extractGmailMessageText } from "@/lib/gmail/parse-transaction-email";
import type { GmailEmailForClassification } from "@/lib/gmail/classify-transaction-emails";
import {
  getOutlookMessages,
  getOutlookPdfAttachments,
  normalizeOutlookBody,
  refreshOutlookAccessToken,
  encryptOutlookRefreshToken,
  type OutlookMessage,
} from "@/lib/outlook/oauth";

export type EmailProviderName = "GMAIL" | "OUTLOOK";

export interface ProviderConnection {
  emailAddress: string | null;
  syncPageToken: string | null;
  lastSyncedAt: Date | null;
  refreshTokenEncrypted: string;
  status: string;
}

export interface ProviderPage {
  /** Provider-native message ids when message content must be fetched separately. */
  messageIds?: string[];
  /** Classification-ready emails when the provider returns full content inline. */
  emails?: GmailEmailForClassification[];
  nextCursor: string | null;
  scannedCount: number;
  empty: boolean;
}

export interface StatementAttachment {
  id: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface EmailSyncProvider {
  provider: EmailProviderName;
  /** Human-readable provider name used in logs and user-facing messages. */
  label: string;
  findConnection(userId: string): Promise<ProviderConnection | null>;
  /**
   * Establish an authenticated session. On token failure the provider must mark
   * the connection RECONNECT_REQUIRED and return `{ error }`.
   */
  authenticate(
    userId: string,
    connection: ProviderConnection,
  ): Promise<{ session: unknown } | { error: string }>;
  listPage(
    session: unknown,
    args: {
      cursor: string | null;
      lookbackDays?: number;
      isIncremental: boolean;
      lastSyncedAt: Date | null;
      connectionEmail: string | null;
    },
  ): Promise<ProviderPage>;
  /** Fetch classification-ready content for provider-native message ids. */
  fetchEmails(session: unknown, messageIds: string[]): Promise<GmailEmailForClassification[]>;
  /** Convert a classification messageId back to the provider-native id. */
  nativeMessageId(classificationId: string): string;
  getStatementAttachments(
    session: unknown,
    email: GmailEmailForClassification,
  ): Promise<StatementAttachment[]>;
  /**
   * Persist the pagination cursor. `lastSyncedAt === undefined` leaves the
   * timestamp untouched; a Date stamps the sync time.
   */
  saveCursor(userId: string, cursor: string | null, lastSyncedAt?: Date): Promise<void>;
}

export function cleanAddress(value: string): string {
  if (typeof value !== "string") return "unknown";
  const trimmed = value.trim();
  if (!trimmed) return "unknown";
  const match = trimmed.match(/<([^>]+)>/);
  const candidate = (match ? match[1] : trimmed).trim();
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (candidate.length <= 320 && emailRegex.test(candidate)) {
    return candidate;
  }
  return candidate.replace(/[\r\n\x00]/g, "").slice(0, 320) || "unknown";
}

type GmailClient = ReturnType<typeof createAuthorizedGmail>["gmail"];

interface GmailSession {
  gmail: GmailClient;
}

const GMAIL_MULTI_MODULE_FILTER =
  '(bank OR debited OR credited OR transaction OR statement OR card OR alert OR UPI OR NEFT OR IMPS OR payment OR spent OR withdrawn OR deposited OR transfer OR invoice OR receipt OR policy OR contract OR certificate OR tax OR warranty OR due OR renewal OR "due date" OR "expiry date" OR "bill generated")';

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  name: string,
): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

async function loadGmailBatch(
  gmail: GmailClient,
  messageIds: string[],
): Promise<GmailEmailForClassification[]> {
  const emails: GmailEmailForClassification[] = [];
  for (let offset = 0; offset < messageIds.length; offset += 10) {
    const fetched = await Promise.all(
      messageIds.slice(offset, offset + 10).map(async (messageId) => {
        const response = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });
        const message = response.data;
        const headers = message.payload?.headers;
        const receivedAt = new Date(Number(message.internalDate || Date.now()));
        return {
          messageId,
          threadId: message.threadId || null,
          from: headerValue(headers, "from"),
          subject: headerValue(headers, "subject").slice(0, 500),
          body:
            extractGmailMessageText(
              message.payload as Parameters<typeof extractGmailMessageText>[0],
            ) ||
            message.snippet ||
            "",
          receivedAt,
        } satisfies GmailEmailForClassification;
      }),
    );
    emails.push(...fetched);
  }
  return emails;
}

export async function loadGmailPdfAttachments(
  gmail: GmailClient,
  messageId: string,
): Promise<StatementAttachment[]> {
  const response = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const attachments: StatementAttachment[] = [];
  const visit = async (part: NonNullable<typeof response.data.payload>) => {
    const filename = part.filename || "";
    const mimeType = part.mimeType || "";
    const attachmentId = part.body?.attachmentId;
    if (
      (filename.toLowerCase().endsWith(".pdf") || mimeType.toLowerCase() === "application/pdf") &&
      Number(part.body?.size || 0) <= 20 * 1024 * 1024
    ) {
      if (attachmentId) {
        const item = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: attachmentId,
        });
        if (item.data.data) {
          const data = Buffer.from(item.data.data, "base64url");
          if (data.length <= 20 * 1024 * 1024) {
            attachments.push({
              id: attachmentId,
              filename: filename || "statement.pdf",
              mimeType: "application/pdf",
              data,
            });
          }
        }
      } else if (part.body?.data) {
        const data = Buffer.from(part.body.data, "base64url");
        if (data.length <= 20 * 1024 * 1024) {
          attachments.push({
            id: `${messageId}-inline-${attachments.length}`,
            filename: filename || "statement.pdf",
            mimeType: "application/pdf",
            data,
          });
        }
      }
    }
    for (const child of part.parts || []) await visit(child);
  };
  if (response.data.payload) await visit(response.data.payload);
  return attachments;
}

export const gmailSyncProvider: EmailSyncProvider = {
  provider: "GMAIL",
  label: "Gmail",

  async findConnection(userId) {
    return prisma.gmailConnection.findUnique({ where: { ownerId: userId } });
  },

  async authenticate(userId, connection) {
    let refreshToken: string;
    try {
      refreshToken = decryptGmailRefreshToken(connection.refreshTokenEncrypted);
    } catch {
      await prisma.gmailConnection.update({
        where: { ownerId: userId },
        data: { status: "RECONNECT_REQUIRED" },
      });
      console.error(`[GMAIL] Token decryption failed for user ${userId}. Reconnect required.`);
      return { error: "Gmail token decryption failed. Reconnect required." };
    }

    if (!refreshToken?.trim()) {
      console.error(`[GMAIL] Invalid or empty refresh token for user ${userId}.`);
      return { error: "Invalid refresh token." };
    }

    const { gmail } = createAuthorizedGmail(refreshToken);
    return { session: { gmail } satisfies GmailSession };
  },

  async listPage(session, args) {
    const { gmail } = session as GmailSession;

    let dateFilter = "";
    if (args.lookbackDays) {
      dateFilter = `newer_than:${args.lookbackDays}d`;
    } else if (args.isIncremental && args.lastSyncedAt) {
      const lastDate = new Date(args.lastSyncedAt);
      const bufferDate = new Date(lastDate.getTime() - 24 * 60 * 60 * 1000);
      const yyyy = bufferDate.getUTCFullYear();
      const mm = String(bufferDate.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(bufferDate.getUTCDate()).padStart(2, "0");
      dateFilter = `after:${yyyy}/${mm}/${dd}`;
    }

    const query = [dateFilter, "-in:sent", GMAIL_MULTI_MODULE_FILTER].filter(Boolean).join(" ");

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 30,
      ...(args.cursor ? { pageToken: args.cursor } : {}),
    });

    const messageIds = (listResponse.data.messages || [])
      .map((message) => message.id)
      .filter((id): id is string => Boolean(id));

    return {
      messageIds,
      nextCursor: listResponse.data.nextPageToken || null,
      scannedCount: messageIds.length,
      empty: messageIds.length === 0,
    };
  },

  fetchEmails(session, messageIds) {
    return loadGmailBatch((session as GmailSession).gmail, messageIds);
  },

  nativeMessageId: (id) => id,

  getStatementAttachments(session, email) {
    return loadGmailPdfAttachments((session as GmailSession).gmail, email.messageId);
  },

  async saveCursor(userId, cursor, lastSyncedAt) {
    await prisma.gmailConnection.update({
      where: { ownerId: userId },
      data: {
        syncPageToken: cursor,
        ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
      },
    });
  },
};

export function toOutlookClassificationEmail(message: OutlookMessage): GmailEmailForClassification {
  const address = message.from?.emailAddress?.address || "unknown";
  const receivedAt = new Date(message.receivedDateTime || Date.now());
  const messageId = `outlook:${message.id}`;
  return {
    messageId,
    threadId: message.conversationId || null,
    from: address,
    subject: (message.subject || "").slice(0, 500),
    body: normalizeOutlookBody(message),
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
  };
}

interface OutlookSession {
  accessToken: string;
  /** Raw messages from the most recent page, keyed by classification messageId. */
  pageCache: Map<string, OutlookMessage>;
}

export const outlookSyncProvider: EmailSyncProvider = {
  provider: "OUTLOOK",
  label: "Outlook",

  async findConnection(userId) {
    return prisma.outlookConnection.findUnique({ where: { ownerId: userId } });
  },

  async authenticate(userId, connection) {
    let tokens: { accessToken: string; refreshToken: string };
    try {
      tokens = await refreshOutlookAccessToken(connection.refreshTokenEncrypted);
      if (tokens.refreshToken) {
        await prisma.outlookConnection.update({
          where: { ownerId: userId },
          data: { refreshTokenEncrypted: encryptOutlookRefreshToken(tokens.refreshToken) },
        });
      }
    } catch {
      await prisma.outlookConnection.update({
        where: { ownerId: userId },
        data: { status: "RECONNECT_REQUIRED" },
      });
      console.error(`[OUTLOOK] Token refresh failed for user ${userId}. Reconnect required.`);
      return { error: "Outlook token refresh failed. Reconnect required." };
    }

    return { session: { accessToken: tokens.accessToken, pageCache: new Map() } };
  },

  async listPage(session, args) {
    const outlook = session as OutlookSession;

    let graphFilter: string;
    if (args.isIncremental && args.lastSyncedAt) {
      const lastDate = new Date(args.lastSyncedAt);
      const bufferDate = new Date(lastDate.getTime() - 24 * 60 * 60 * 1000);
      graphFilter = `receivedDateTime ge ${bufferDate.toISOString()} and isDraft eq false`;
    } else {
      graphFilter = "isDraft eq false";
    }

    const pageData = await getOutlookMessages(outlook.accessToken, args.cursor, {
      filter: args.cursor ? undefined : graphFilter,
    });

    // Filter out drafts and messages sent by the user so we only scan incoming mail.
    const messages = (pageData.messages || []).filter((msg) => {
      if (msg.isDraft) return false;
      const fromAddr = msg.from?.emailAddress?.address?.trim().toLowerCase();
      const connAddr = args.connectionEmail?.trim().toLowerCase();
      if (fromAddr && connAddr && fromAddr === connAddr) return false;
      return true;
    });

    const emails = messages.map(toOutlookClassificationEmail);
    outlook.pageCache = new Map(emails.map((email, index) => [email.messageId, messages[index]]));

    return {
      emails,
      nextCursor: pageData.nextLink,
      scannedCount: messages.length,
      empty: messages.length === 0,
    };
  },

  fetchEmails(session, messageIds) {
    const outlook = session as OutlookSession;
    return Promise.resolve(
      messageIds
        .map((id) => outlook.pageCache.get(id))
        .filter((msg): msg is OutlookMessage => Boolean(msg))
        .map(toOutlookClassificationEmail),
    );
  },

  nativeMessageId: (id) => id.replace(/^outlook:/, ""),

  async getStatementAttachments(session, email) {
    const outlook = session as OutlookSession;
    const rawId = email.messageId.replace(/^outlook:/, "");
    const message = outlook.pageCache.get(email.messageId);
    if (!message?.hasAttachments) return [];
    return getOutlookPdfAttachments(outlook.accessToken, rawId);
  },

  async saveCursor(userId, cursor, lastSyncedAt) {
    await prisma.outlookConnection.update({
      where: { ownerId: userId },
      data: {
        syncPageToken: cursor,
        ...(lastSyncedAt !== undefined ? { lastSyncedAt } : {}),
      },
    });
  },
};

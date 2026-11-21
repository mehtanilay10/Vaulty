import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getAppBaseUrl } from "@/lib/url";
import { createOAuthState, verifyOAuthState } from "@/lib/oauth-state";
import {
  OUTLOOK_GRAPH_BASE as GRAPH_BASE,
  OUTLOOK_TOKEN_SCOPES as TOKEN_SCOPES,
  OUTLOOK_CALLBACK_PATH as CALLBACK_PATH,
} from "@/lib/constants";

function config() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be configured.");
  }
  return { clientId, clientSecret, tenant: process.env.MICROSOFT_TENANT_ID || "consumers" };
}

export function getOutlookRedirectUri() {
  return `${getAppBaseUrl()}${CALLBACK_PATH}`;
}

function stateSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return secret;
}

export function createOutlookConnectUrl(userId: string) {
  const { clientId, tenant } = config();
  const state = createOAuthState(userId);
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getOutlookRedirectUri(),
    response_mode: "query",
    scope: TOKEN_SCOPES.join(" "),
    state,
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export function verifyOutlookOAuthState(state: string | null): string | null {
  return verifyOAuthState(state);
}

function encryptionKey() {
  return createHash("sha256").update(`vaulty:outlook-refresh-token:v1:${stateSecret()}`).digest();
}

export function encryptOutlookRefreshToken(refreshToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptOutlookRefreshToken(value: string) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Stored Outlook token has an unsupported format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function tokenRequest(body: URLSearchParams) {
  const { clientId, clientSecret, tenant } = config();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Microsoft token request failed (${response.status}).`,
    );
  }
  return payload;
}

export async function exchangeOutlookCode(code: string) {
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getOutlookRedirectUri(),
      scope: TOKEN_SCOPES.join(" "),
    }),
  );
  return { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token || null };
}

export async function refreshOutlookAccessToken(encryptedRefreshToken: string) {
  const refreshToken = decryptOutlookRefreshToken(encryptedRefreshToken);
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: TOKEN_SCOPES.join(" "),
    }),
  );
  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token || refreshToken,
  };
}

export async function getOutlookProfile(accessToken: string) {
  const response = await fetch(`${GRAPH_BASE}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const profile = (await response.json().catch(() => ({}))) as {
    mail?: string | null;
    userPrincipalName?: string | null;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(
      profile.error?.message || `Microsoft Graph profile request failed (${response.status}).`,
    );
  const email = profile.mail || profile.userPrincipalName;
  if (!email) throw new Error("Microsoft Graph did not return an email address for this account.");
  return email;
}

export interface OutlookMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { address?: string } };
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  hasAttachments?: boolean;
  isDraft?: boolean;
  parentFolderId?: string;
}

export async function getOutlookMessages(
  accessToken: string,
  nextLink?: string | null,
  options?: { filter?: string },
) {
  const initial = new URL(`${GRAPH_BASE}/me/messages`);
  initial.searchParams.set("$top", "30");
  initial.searchParams.set("$orderby", "receivedDateTime desc");
  initial.searchParams.set(
    "$select",
    "id,conversationId,from,subject,receivedDateTime,body,bodyPreview,hasAttachments,isDraft,parentFolderId",
  );
  if (options?.filter && !nextLink) {
    initial.searchParams.set("$filter", options.filter);
  }
  const parsed = new URL(nextLink || initial.toString());
  const normalizedPath = parsed.pathname.replace(/\('([^']+)'\)/g, "/$1");
  const validPaths = ["/v1.0/me/messages", "/v1.0/me/mailFolders/inbox/messages"];
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "graph.microsoft.com" ||
    (!validPaths.includes(normalizedPath) && !validPaths.includes(parsed.pathname))
  ) {
    throw new Error("Stored Outlook page cursor is invalid.");
  }
  const response = await fetch(parsed.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.body-content-type="text"',
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    value?: OutlookMessage[];
    "@odata.nextLink"?: string;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(
      data.error?.message || `Microsoft Graph mail request failed (${response.status}).`,
    );
  return { messages: data.value || [], nextLink: data["@odata.nextLink"] || null };
}

export function normalizeOutlookBody(message: OutlookMessage): string {
  const content = message.body?.content || message.bodyPreview || "";
  if (message.body?.contentType?.toLowerCase() !== "html") return content.slice(0, 8_000);
  return content
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8_000);
}

const MAX_OUTLOOK_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_OUTLOOK_PDF_ATTACHMENTS = 5;

type OutlookAttachmentSummary = {
  id?: string;
  name?: string;
  contentType?: string;
  isInline?: boolean;
  size?: number;
};

export async function getOutlookPdfAttachments(accessToken: string, messageId: string) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  // contentBytes lives on the derived microsoft.graph.fileAttachment type, so it
  // cannot be requested via $select on the base attachment collection. List the
  // metadata first, then fetch each candidate attachment individually.
  const url = new URL(`${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments`);
  url.searchParams.set("$select", "id,name,contentType,isInline,size");
  const response = await fetch(url.toString(), { headers, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as {
    value?: OutlookAttachmentSummary[];
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(
      data.error?.message || `Microsoft Graph attachment request failed (${response.status}).`,
    );

  const candidates = (data.value || [])
    .filter(
      (item) =>
        !item.isInline &&
        (item.contentType?.toLowerCase() === "application/pdf" ||
          item.name?.toLowerCase().endsWith(".pdf")) &&
        (item.size || 0) <= MAX_OUTLOOK_ATTACHMENT_BYTES,
    )
    .slice(0, MAX_OUTLOOK_PDF_ATTACHMENTS);

  const attachments = await Promise.all(
    candidates.map(async (item) => {
      if (!item.id) return null;
      const attachmentUrl = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(item.id)}`;
      const attachmentResponse = await fetch(attachmentUrl, { headers, cache: "no-store" });
      if (!attachmentResponse.ok) return null;
      const attachment = (await attachmentResponse.json().catch(() => null)) as {
        contentBytes?: string;
      } | null;
      if (!attachment?.contentBytes) return null;
      const buffer = Buffer.from(attachment.contentBytes, "base64");
      if (!buffer.length || buffer.length > MAX_OUTLOOK_ATTACHMENT_BYTES) return null;
      return {
        id: item.id,
        filename: item.name || "statement.pdf",
        mimeType: "application/pdf",
        data: buffer,
      };
    }),
  );

  return attachments.filter((item): item is NonNullable<typeof item> => item !== null);
}

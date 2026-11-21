import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { google } from "googleapis";
import { getAppBaseUrl } from "@/lib/url";
import { createOAuthState, getStateSecret, verifyOAuthState } from "@/lib/oauth-state";
import { GMAIL_READONLY_SCOPE, GMAIL_CALLBACK_PATH } from "@/lib/constants";

function getRedirectUri() {
  return `${getAppBaseUrl()}${GMAIL_CALLBACK_PATH}`;
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function createGmailConnectUrl(userId: string) {
  const state = createOAuthState(userId);

  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    response_type: "code",
    scope: ["openid", "email", "profile", GMAIL_READONLY_SCOPE],
    state,
  });
}

export function verifyGmailOAuthState(state: string | null): string | null {
  return verifyOAuthState(state);
}

export async function exchangeGmailCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;
  if (!email) throw new Error("Google did not return the Gmail address for this connection.");

  return {
    email,
    refreshToken: tokens.refresh_token || null,
  };
}

function encryptionKey() {
  const secret = getStateSecret();
  return createHash("sha256").update(`vaulty:gmail-refresh-token:v1:${secret}`).digest();
}

export function encryptGmailRefreshToken(refreshToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptGmailRefreshToken(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Stored Gmail token has an unsupported format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createAuthorizedGmail(refreshToken: string) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return {
    client,
    gmail: google.gmail({ version: "v1", auth: client }),
  };
}

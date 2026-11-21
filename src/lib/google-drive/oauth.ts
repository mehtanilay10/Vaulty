import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";
import { getAppBaseUrl } from "@/lib/url";
import { createOAuthState, getStateSecret, verifyOAuthState } from "@/lib/oauth-state";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];

function driveEncryptionKey(): Buffer {
  const secret = getStateSecret();
  return createHash("sha256").update(`vaulty:drive-refresh-token:v1:${secret}`).digest();
}

export function encryptDriveRefreshToken(refreshToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", driveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptDriveRefreshToken(value: string): string {
  if (!value.startsWith("v1.")) {
    return value;
  }
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    return value;
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      driveEncryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    console.error("Failed to decrypt Google Drive refresh token:", error);
    return value;
  }
}

export function createGoogleDriveAuthUrl(userId: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${getAppBaseUrl()}/api/integrations/google-drive/callback`;

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  const state = createOAuthState(userId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function verifyGoogleDriveOAuthState(state: string | null): string | null {
  return verifyOAuthState(state);
}

/**
 * Revoke Google OAuth tokens with Google's revocation endpoint
 */
export async function revokeGoogleTokens(accessToken: string): Promise<void> {
  const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Failed to revoke Google token: ${response.statusText}`);
  }
}

/**
 * Check if a Google Drive connection needs reconnection
 */
export async function checkConnectionStatus(userId: string): Promise<boolean> {
  const connection = await prisma.storageConnection.findFirst({
    where: {
      userId,
      provider: "GOOGLE_DRIVE",
    },
  });

  if (!connection) return false;

  // Check if status is already marked as needing reconnection
  if (connection.status === "RECONNECT_REQUIRED" || connection.status === "DISCONNECTED") {
    return true;
  }

  // Check if token is expired or will expire soon (within 5 minutes)
  if (connection.expiresAt && connection.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    // If no refresh token, reconnection is required
    if (!connection.refreshToken) {
      await prisma.storageConnection.update({
        where: { id: connection.id },
        data: { status: "RECONNECT_REQUIRED" },
      });
      return true;
    }
  }

  return false;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms = 15000,
  label = "External operation",
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${getAppBaseUrl()}/api/integrations/google-drive/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await withTimeout(oauth2Client.getToken(code), 15000, "Google OAuth getToken");

  const accessToken = tokens.access_token || "";
  const refreshToken = tokens.refresh_token || "";
  const expiresIn = tokens.expiry_date
    ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
    : 3600;

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

export async function createVaultyRootFolder(accessToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const searchRes = await withTimeout(
    drive.files.list({
      q: "name='Vaulty' and trashed=false and 'root' in parents and mimeType='application/vnd.google-apps.folder'",
      fields: "files(id,name)",
      pageSize: 10,
    }),
    15000,
    "Google Drive list root folder",
  );

  const existing = searchRes.data.files?.find((f) => f.name === "Vaulty");
  if (existing) {
    return existing.id || "";
  }

  const folder = await withTimeout(
    drive.files.create({
      requestBody: {
        name: "Vaulty",
        mimeType: "application/vnd.google-apps.folder",
        parents: ["root"],
      },
      fields: "id,name",
    }),
    15000,
    "Google Drive create root folder",
  );

  return folder.data.id || "";
}

export async function createVaultySubFolders(
  accessToken: string,
  rootFolderId: string,
): Promise<{
  docs: string;
  summary: string;
  interpretation: string;
  text: string;
}> {
  const docs = await createSubFolder(accessToken, rootFolderId, "Docs");
  const summary = await createSubFolder(accessToken, rootFolderId, "Summary");
  const interpretation = await createSubFolder(accessToken, rootFolderId, "Interpretation");
  const text = await createSubFolder(accessToken, rootFolderId, "Text");

  return { docs, summary, interpretation, text };
}

async function createSubFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const searchRes = await drive.files.list({
    q: `name='${name}' and trashed=false and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder'`,
    fields: "files(id,name)",
    pageSize: 10,
  });

  const existing = searchRes.data.files?.find((f) => f.name === name);
  if (existing) return existing.id || "";

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name",
  });

  return folder.data.id || "";
}

export async function setupGoogleDriveConnection(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  },
): Promise<{
  rootFolderId: string;
  docsFolderId: string;
  summaryFolderId: string;
  interpretationFolderId: string;
  textFolderId: string;
}> {
  const existingConnection = await prisma.storageConnection.findFirst({
    where: {
      userId,
      provider: "GOOGLE_DRIVE",
    },
  });

  let storedRefreshToken: string | null = null;
  if (tokens.refreshToken && tokens.refreshToken.trim()) {
    storedRefreshToken = encryptDriveRefreshToken(tokens.refreshToken.trim());
  } else if (existingConnection?.refreshToken) {
    // Retain existing refresh token if Google didn't return a new one on re-auth
    storedRefreshToken = existingConnection.refreshToken;
  }

  const rootFolderId = await createVaultyRootFolder(tokens.accessToken);
  const { docs, summary, interpretation, text } = await createVaultySubFolders(
    tokens.accessToken,
    rootFolderId,
  );

  await prisma.storageConnection.upsert({
    where: {
      userId_provider: {
        userId,
        provider: "GOOGLE_DRIVE",
      },
    },
    update: {
      status: StorageConnectionStatus.CONNECTED,
      accessToken: tokens.accessToken,
      refreshToken: storedRefreshToken,
      expiresAt: tokens.expiresAt,
      rootFolderId,
      docsFolderId: docs,
      summaryFolderId: summary,
      interpretationFolderId: interpretation,
      textFolderId: text,
    },
    create: {
      userId,
      provider: "GOOGLE_DRIVE",
      status: StorageConnectionStatus.CONNECTED,
      accessToken: tokens.accessToken,
      refreshToken: storedRefreshToken,
      expiresAt: tokens.expiresAt,
      rootFolderId,
      docsFolderId: docs,
      summaryFolderId: summary,
      interpretationFolderId: interpretation,
      textFolderId: text,
    },
  });

  return {
    rootFolderId,
    docsFolderId: docs,
    summaryFolderId: summary,
    interpretationFolderId: interpretation,
    textFolderId: text,
  };
}

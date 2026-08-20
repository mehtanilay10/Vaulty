import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";

const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly"
];

export function getGoogleDriveAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/api/integrations/google-drive/callback`
    : "http://localhost:3000/api/integrations/google-drive/callback";

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

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

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/api/integrations/google-drive/callback`
    : "http://localhost:3000/api/integrations/google-drive/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  const accessToken = tokens.access_token || "";
  const refreshToken = tokens.refresh_token || "";
  const expiresIn = tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600;

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

  const searchRes = await drive.files.list({
    q: "name='Vaulty' and trashed=false and 'root' in parents and mimeType='application/vnd.google-apps.folder'",
    fields: "files(id,name)",
    pageSize: 10,
  });

  const existing = searchRes.data.files?.find((f) => f.name === "Vaulty");
  if (existing) {
    return existing.id || "";
  }

  const folder = await drive.files.create({
    requestBody: {
      name: "Vaulty",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    },
    fields: "id,name",
  });

  return folder.data.id || "";
}

export async function createVaultySubFolders(accessToken: string, rootFolderId: string): Promise<{
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

async function createSubFolder(accessToken: string, parentId: string, name: string): Promise<string> {
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

export async function setupGoogleDriveConnection(userId: string, tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}): Promise<{
  rootFolderId: string;
  docsFolderId: string;
  summaryFolderId: string;
  interpretationFolderId: string;
  textFolderId: string;
}> {
  const rootFolderId = await createVaultyRootFolder(tokens.accessToken);
  const { docs, summary, interpretation, text } = await createVaultySubFolders(tokens.accessToken, rootFolderId);

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
      refreshToken: tokens.refreshToken,
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
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      rootFolderId,
      docsFolderId: docs,
      summaryFolderId: summary,
      interpretationFolderId: interpretation,
      textFolderId: text,
    },
  });

  return { rootFolderId, docsFolderId: docs, summaryFolderId: summary, interpretationFolderId: interpretation, textFolderId: text };
}

import { prisma } from "@/lib/prisma";
import { StorageConnectionStatus } from "@prisma/client";

const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file"
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

  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("code", code);
  params.append("redirect_uri", redirectUri);
  params.append("grant_type", "authorization_code");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to exchange code for tokens: ${res.status} ${text}`);
  }

  const data = await res.json();
  const accessToken = data.access_token as string;
  const refreshToken = data.refresh_token as string;
  const expiresIn = data.expires_in as number;

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

export async function createVaultyRootFolder(accessToken: string): Promise<string> {
  const searchRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=name%3D%27Vaulty%27+and+trashed%3Dfalse+and+%27root%27+in+parents+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27&fields=files(id%2Cname)",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(`Failed to search for Vaulty folder: ${searchRes.status} ${text}`);
  }

  const searchData = await searchRes.json() as { files?: Array<{ id: string; name: string }> };
  const existing = searchData.files?.find((f) => f.name === "Vaulty");

  if (existing) {
    return existing.id;
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Vaulty",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create Vaulty folder: ${createRes.status} ${text}`);
  }

  const folder = await createRes.json();
  return folder.id;
}

export async function createVaultySubFolders(accessToken: string, rootFolderId: string): Promise<{
  docs: string;
  summary: string;
  text: string;
}> {
  const docs = await createSubFolder(accessToken, rootFolderId, "Docs");
  const summary = await createSubFolder(accessToken, rootFolderId, "Summary");
  const text = await createSubFolder(accessToken, rootFolderId, "Text");

  return { docs, summary, text };
}

async function createSubFolder(accessToken: string, parentId: string, name: string): Promise<string> {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name%3D%27${encodeURIComponent(name)}%27+and+trashed%3Dfalse+and+%27${parentId}%27+in+parents+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27&fields=files(id%2Cname)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json() as { files?: Array<{ id: string; name: string }> };
    const existing = searchData.files?.find((f) => f.name === name);
    if (existing) return existing.id;
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create ${name} folder: ${createRes.status} ${text}`);
  }

  const folder = await createRes.json();
  return folder.id;
}

export async function setupGoogleDriveConnection(userId: string, tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}): Promise<{
  rootFolderId: string;
  docsFolderId: string;
  summaryFolderId: string;
  textFolderId: string;
}> {
  const rootFolderId = await createVaultyRootFolder(tokens.accessToken);
  const { docs, summary, text } = await createVaultySubFolders(tokens.accessToken, rootFolderId);

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
      textFolderId: text,
    },
  });

  return { rootFolderId, docsFolderId: docs, summaryFolderId: summary, textFolderId: text };
}

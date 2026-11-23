import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { z } from "zod";

const createAppCredentialSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().max(2000).nullish(),
  username: z.string().min(1).max(320),
  // Client-side envelope ciphertext; generous cap for JSON envelopes.
  password: z.string().min(1).max(100000),
  totpSecret: z.string().max(100000).nullish(),
  icon: z.string().max(100).nullish(),
  iconColor: z.string().max(50).nullish(),
  isFavorite: z.boolean().optional(),
});

// GET - List all app credentials
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const vault = await prisma.passwordVault.findUnique({
      where: { userId: session.user.id },
      include: {
        appCredentials: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Also check shared vaults
    let vaultId = vault?.id;
    let access: { hasAccess: boolean; isOwner: boolean; permission: string } | null = null;
    if (vault) {
      access = { hasAccess: true, isOwner: true, permission: "OWNER" };
    } else {
      const share = await prisma.vaultShare.findFirst({
        where: { sharedWithId: session.user.id },
        select: { vaultId: true, permission: true },
      });
      if (share) {
        vaultId = share.vaultId;
        access = { hasAccess: true, isOwner: false, permission: share.permission };
      }
    }

    if (!vaultId || !access?.hasAccess) {
      return NextResponse.json({ credentials: [] });
    }

    const targetVault = await prisma.passwordVault.findUnique({
      where: { id: vaultId },
      include: {
        appCredentials: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!targetVault) {
      return NextResponse.json({ credentials: [] });
    }

    return NextResponse.json({
      credentials: targetVault.appCredentials,
      isOwner: access.isOwner,
      permission: access.permission,
    });
  } catch (error) {
    console.error("Error fetching app credentials:", error);
    return NextResponse.json({ error: "Failed to fetch app credentials" }, { status: 500 });
  }
}

// POST - Create new app credential
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate CSRF token
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const parsed = createAppCredentialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credential fields." }, { status: 400 });
    }
    const { name, url, username, password, totpSecret, icon, iconColor, isFavorite } = parsed.data;

    // Get user's vault
    const vault = await prisma.passwordVault.findUnique({
      where: { userId: session.user.id },
    });

    if (!vault || !vault.isConfigured) {
      return NextResponse.json(
        { error: "Vault not found. Please setup password vault first." },
        { status: 404 },
      );
    }

    // Create app credential (all fields are encrypted client-side)
    const credential = await prisma.appCredential.create({
      data: {
        vaultId: vault.id,
        name,
        url: url || null,
        username,
        password,
        totpSecret: totpSecret || null,
        isFavorite: isFavorite === true,
        icon: icon || null,
        iconColor: iconColor || null,
      },
    });

    return NextResponse.json({ success: true, credential });
  } catch (error) {
    console.error("Error creating app credential:", error);
    return NextResponse.json({ error: "Failed to create app credential" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getVaultAccess } from "@/lib/vault-access";
import { validateCSRFRequest } from "@/lib/csrf";
import { z } from "zod";

const updateAppCredentialSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().max(2000).nullish(),
  username: z.string().min(1).max(320).optional(),
  password: z.string().min(1).max(100000).optional(),
  totpSecret: z.string().max(100000).nullish(),
  icon: z.string().max(100).nullish(),
  iconColor: z.string().max(50).nullish(),
  isFavorite: z.boolean().optional(),
});

// PUT - Update app credential
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });

    const parsed = updateAppCredentialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credential fields." }, { status: 400 });
    }

    const { name, url, username, password, totpSecret, icon, iconColor, isFavorite } = parsed.data;
    const { id } = await params;

    // Validate CSRF token
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Get the credential and verify ownership
    const credential = await prisma.appCredential.findUnique({
      where: { id },
      include: { vault: true },
    });

    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    const access = await getVaultAccess(session.user.id, credential.vaultId);

    if (!access.hasAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!access.isOwner && access.permission !== "FULL_ACCESS") {
      return NextResponse.json({ error: "Read-only access" }, { status: 403 });
    }

    // Update credential (preserve optional fields when undefined; allow null/empty to clear)
    const updated = await prisma.appCredential.update({
      where: { id },
      data: {
        name: name !== undefined ? name : credential.name,
        url: url !== undefined ? (url && url !== "" ? url : null) : credential.url,
        username: username !== undefined ? username : credential.username,
        password: password !== undefined ? password : credential.password,
        totpSecret:
          totpSecret !== undefined
            ? totpSecret && totpSecret !== ""
              ? totpSecret
              : null
            : credential.totpSecret,
        isFavorite: isFavorite !== undefined ? isFavorite : credential.isFavorite,
        icon: icon !== undefined ? (icon && icon !== "" ? icon : null) : credential.icon,
        iconColor:
          iconColor !== undefined
            ? iconColor && iconColor !== ""
              ? iconColor
              : null
            : credential.iconColor,
      },
    });

    return NextResponse.json({ success: true, credential: updated });
  } catch (error) {
    console.error("Error updating app credential:", error);
    return NextResponse.json({ error: "Failed to update app credential" }, { status: 500 });
  }
}

// DELETE - Delete app credential
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate CSRF token
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;

    // Get the credential and verify ownership
    const credential = await prisma.appCredential.findUnique({
      where: { id },
      include: { vault: true },
    });

    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    const access = await getVaultAccess(session.user.id, credential.vaultId);

    if (!access.hasAccess || (!access.isOwner && access.permission !== "FULL_ACCESS")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete credential
    await prisma.appCredential.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting app credential:", error);
    return NextResponse.json({ error: "Failed to delete app credential" }, { status: 500 });
  }
}

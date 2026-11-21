import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { invalidateUserSessions } from "@/lib/session-validation";

type Permission = "READ_ONLY" | "FULL_ACCESS";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const vault = await prisma.passwordVault.findUnique({
      where: { id },
      select: { id: true, userId: true, isConfigured: true },
    });

    if (!vault || !vault.isConfigured) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }

    const isOwner = vault.userId === user.id;
    if (!isOwner) {
      // Shared users can only see their own share
      const share = await prisma.vaultShare.findFirst({
        where: { vaultId: id, sharedWithId: user.id },
        select: { id: true, permission: true, createdAt: true },
      });
      return NextResponse.json({ shares: share ? [share] : [] });
    }

    const shares = await prisma.vaultShare.findMany({
      where: { vaultId: id },
      include: {
        sharedWith: { select: { id: true, name: true, email: true } },
        sharedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ shares });
  } catch (error) {
    console.error("GET vault shares error:", error);
    return NextResponse.json({ error: "Failed to fetch vault shares" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;

    const vault = await prisma.passwordVault.findUnique({
      where: { id },
      select: { id: true, userId: true, isConfigured: true },
    });

    if (!vault || !vault.isConfigured) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }

    if (vault.userId !== user.id) {
      return NextResponse.json({ error: "Only the vault owner can share" }, { status: 403 });
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const { sharedWithUserId, permission } = body;

    if (!sharedWithUserId) {
      return NextResponse.json({ error: "Target user ID is required" }, { status: 400 });
    }

    if (sharedWithUserId === user.id) {
      return NextResponse.json(
        { error: "You cannot share a vault with yourself" },
        { status: 400 },
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: sharedWithUserId },
      select: { id: true, email: true, name: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Target user is not registered" }, { status: 404 });
    }

    const perm: Permission = permission === "FULL_ACCESS" ? "FULL_ACCESS" : "READ_ONLY";

    const share = await prisma.vaultShare.upsert({
      where: { vaultId_sharedWithId: { vaultId: id, sharedWithId: sharedWithUserId } },
      update: { permission: perm },
      create: {
        vaultId: id,
        sharedWithId: sharedWithUserId,
        sharedById: user.id,
        permission: perm,
      },
      include: {
        sharedWith: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.passwordAuditLog.create({
      data: {
        vaultId: id,
        action: "VAULT_SHARED",
        metadata: JSON.stringify({
          sharedWithUserId,
          permission: perm,
          targetEmail: targetUser.email,
        }),
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({ share }, { status: 201 });
  } catch (error) {
    console.error("POST vault share error:", error);
    return NextResponse.json({ error: "Failed to share vault" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;

    const vault = await prisma.passwordVault.findUnique({
      where: { id },
      select: { id: true, userId: true, isConfigured: true },
    });

    if (!vault || !vault.isConfigured) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }

    if (vault.userId !== user.id) {
      return NextResponse.json(
        { error: "Only the vault owner can revoke shares" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const sharedWithUserId = searchParams.get("userId");

    if (!sharedWithUserId) {
      return NextResponse.json({ error: "User ID parameter is required" }, { status: 400 });
    }

    await prisma.vaultShare.deleteMany({
      where: { vaultId: id, sharedWithId: sharedWithUserId },
    });

    // Invalidate recipient's sessions to immediately block access
    await invalidateUserSessions(sharedWithUserId);

    await prisma.passwordAuditLog.create({
      data: {
        vaultId: id,
        action: "VAULT_UNSHARED",
        metadata: JSON.stringify({ revokedUserId: sharedWithUserId }),
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        userAgent: req.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE vault share error:", error);
    return NextResponse.json({ error: "Failed to revoke vault share" }, { status: 500 });
  }
}

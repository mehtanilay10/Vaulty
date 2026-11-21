import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { invalidateUserSessions } from "@/lib/session-validation";
import { validateCSRFRequest } from "@/lib/csrf";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }
    const access = await checkFolderAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the folder owner can share this folder." },
        { status: 403 },
      );
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const { sharedWithUserId } = body;

    if (!sharedWithUserId) {
      return NextResponse.json({ error: "Target user ID is required." }, { status: 400 });
    }

    if (sharedWithUserId === user.id) {
      return NextResponse.json(
        { error: "You cannot share a folder with yourself." },
        { status: 400 },
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: sharedWithUserId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "Target user is not registered." }, { status: 404 });
    }

    const share = await prisma.folderShare.upsert({
      where: {
        folderId_sharedWithUserId: {
          folderId: id,
          sharedWithUserId,
        },
      },
      update: { permission: "READ_ONLY" },
      create: {
        folderId: id,
        sharedWithUserId,
        createdById: user.id,
        permission: "READ_ONLY",
      },
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        action: "FOLDER_SHARE",
        userId: user.id,
        folderId: id,
        metadata: JSON.stringify({ sharedWithUserId, recipientEmail: targetUser.email }),
      },
    });

    return NextResponse.json({ share }, { status: 201 });
  } catch (error) {
    console.error("POST /api/folders/[id]/shares error:", error);
    return NextResponse.json({ error: "Failed to share folder." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }
    const access = await checkFolderAccess(user.id, id);

    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the folder owner can revoke folder shares." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const sharedWithUserId = searchParams.get("userId");

    if (!sharedWithUserId) {
      return NextResponse.json({ error: "User ID parameter is required." }, { status: 400 });
    }

    await prisma.folderShare.deleteMany({
      where: {
        folderId: id,
        sharedWithUserId: sharedWithUserId,
      },
    });

    // Invalidate recipient's sessions to immediately block access
    await invalidateUserSessions(sharedWithUserId);

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        action: "FOLDER_UNSHARE",
        userId: user.id,
        folderId: id,
        metadata: JSON.stringify({ revokedUserId: sharedWithUserId }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/folders/[id]/shares error:", error);
    return NextResponse.json({ error: "Failed to revoke folder share." }, { status: 500 });
  }
}

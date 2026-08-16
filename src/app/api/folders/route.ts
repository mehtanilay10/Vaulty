import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch folders owned by user
    const ownedFolders = await prisma.folder.findMany({
      where: { ownerId: user.id },
      include: {
        _count: { select: { documents: true, children: true } },
        shares: { select: { sharedWith: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ folders: ownedFolders });
  } catch (error) {
    console.error("GET /api/folders error:", error);
    return NextResponse.json({ error: "Failed to fetch folders." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, parentId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Folder name is required." }, { status: 400 });
    }

    // If parentId is provided, verify user owns the parent folder
    if (parentId) {
      const parentAccess = await checkFolderAccess(user.id, parentId);
      if (!parentAccess.isOwner) {
        return NextResponse.json(
          { error: "You can only create subfolders inside folders you own." },
          { status: 403 }
        );
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        ownerId: user.id,
        parentId: parentId || null,
      },
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        action: "FOLDER_CREATE",
        userId: user.id,
        folderId: folder.id,
        metadata: JSON.stringify({ folderName: folder.name, parentId: folder.parentId }),
      },
    });

    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    console.error("POST /api/folders error:", error);
    return NextResponse.json({ error: "Failed to create folder." }, { status: 500 });
  }
}

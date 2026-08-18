import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { getProviderForUser } from "@/lib/storage/factory";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    if (parentId) {
      const parentAccess = await checkFolderAccess(user.id, parentId);
      if (!parentAccess.isOwner) {
        return NextResponse.json(
          { error: "You can only create subfolders inside folders you own." },
          { status: 403 }
        );
      }
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { defaultStorageProvider: true },
    });

    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        ownerId: user.id,
        parentId: parentId || null,
        storageProvider: userRecord?.defaultStorageProvider || "GOOGLE_DRIVE",
      },
    });

    if (userRecord?.defaultStorageProvider === "GOOGLE_DRIVE") {
      try {
        const { provider } = await getProviderForUser(user.id, "GOOGLE_DRIVE");
        const vaultyFolders = await provider.ensureVaultyFolders();
        const docsFolderId = vaultyFolders.docs;

        let parentDriveId: string | undefined;

        if (parentId) {
          const parentFolder = await prisma.folder.findUnique({
            where: { id: parentId },
            select: { storageFolderId: true, name: true, parentId: true },
          });

          if (parentFolder?.storageFolderId) {
            parentDriveId = parentFolder.storageFolderId;
          } else if (parentFolder) {
            const pathNames: string[] = [];
            let current: { name: string; parentId: string | null } = parentFolder;

            while (current) {
              pathNames.unshift(current.name);
              if (!current.parentId) break;
              const ancestor: { name: string; parentId: string | null } | null = await prisma.folder.findUnique({
                where: { id: current.parentId },
                select: { name: true, parentId: true },
              });
              current = ancestor!;
            }

            parentDriveId = await provider.createFolderPath(pathNames, docsFolderId);
            await prisma.folder.update({
              where: { id: parentId },
              data: { storageFolderId: parentDriveId },
            });
          }
        }

        if (!parentDriveId) {
          parentDriveId = docsFolderId;
        }

        const driveFolder = await provider.createFolder(folder.name, parentDriveId);
        await prisma.folder.update({
          where: { id: folder.id },
          data: { storageFolderId: driveFolder.id },
        });
      } catch (driveError) {
        console.error("Failed to create Drive folder for new Vaulty folder:", driveError);
      }
    }

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

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WealthAccountType, ReminderCategory } from "@prisma/client";
import { z } from "zod";

const MODE = "insensitive" as const;

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = z
      .object({
        q: z.string().trim().max(100).default(""),
        limit: z.coerce.number().int().min(1).max(20).default(6),
      })
      .safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid search query." }, { status: 400 });
    }

    const { q, limit } = parsed.data;
    if (!q || q.length < 2) {
      return NextResponse.json({
        query: q,
        results: {
          documents: [],
          folders: [],
          wealth: [],
          credentials: [],
          reminders: [],
        },
        totalCount: 0,
      });
    }

    const queryStr = q.trim();

    // 1. Shared folders access for document scoping (only run recursive CTE if user has any folder shares)
    const hasFolderShares = await prisma.folderShare.findFirst({
      where: { sharedWithUserId: user.id },
      select: { id: true },
    });
    let sharedFolderIds: string[] = [];
    if (hasFolderShares) {
      const sharedFolderRows = await prisma.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE shared_tree AS (
          SELECT f.id FROM "Folder" f
          INNER JOIN "FolderShare" fs ON fs."folderId" = f.id
          WHERE fs."sharedWithUserId" = ${user.id}
          UNION ALL
          SELECT child.id FROM "Folder" child
          INNER JOIN shared_tree parent ON child."parentId" = parent.id
        )
        SELECT DISTINCT id FROM shared_tree
      `;
      sharedFolderIds = sharedFolderRows.map((row) => row.id);
    }

    const matchingWealthTypes = Object.values(WealthAccountType).filter(
      (t) =>
        t.toLowerCase().includes(queryStr.toLowerCase()) ||
        t.replace(/_/g, " ").toLowerCase().includes(queryStr.toLowerCase()),
    );

    const matchingCategories = Object.values(ReminderCategory).filter((c) =>
      c.toLowerCase().includes(queryStr.toLowerCase()),
    );

    // Run parallel queries across all 5 modules
    const [documents, folders, wealthAccounts, appCredentials, bankCredentials, reminders] =
      await Promise.all([
        // Documents
        prisma.document.findMany({
          where: {
            AND: [
              {
                OR: [
                  { ownerId: user.id },
                  ...(sharedFolderIds.length ? [{ folderId: { in: sharedFolderIds } }] : []),
                  {
                    owner: {
                      familyMembershipsOwned: {
                        some: { memberId: user.id, shareDocuments: true },
                      },
                    },
                  },
                ],
              },
              {
                OR: [
                  { name: { contains: queryStr, mode: MODE } },
                  { folder: { name: { contains: queryStr, mode: MODE } } },
                  { tags: { some: { tag: { name: { contains: queryStr, mode: MODE } } } } },
                ],
              },
            ],
          },
          select: {
            id: true,
            name: true,
            mimeType: true,
            folder: { select: { id: true, name: true } },
            updatedAt: true,
          },
          take: limit,
          orderBy: { updatedAt: "desc" },
        }),

        // Folders
        prisma.folder.findMany({
          where: {
            OR: [
              { ownerId: user.id, name: { contains: queryStr, mode: MODE } },
              {
                id: { in: sharedFolderIds },
                name: { contains: queryStr, mode: MODE },
              },
            ],
          },
          select: {
            id: true,
            name: true,
            _count: { select: { documents: true } },
          },
          take: limit,
          orderBy: { name: "asc" },
        }),

        // Wealth Accounts
        prisma.wealthAccount.findMany({
          where: {
            ownerId: user.id,
            OR: [
              { name: { contains: queryStr, mode: MODE } },
              { category: { contains: queryStr, mode: MODE } },
              { currency: { contains: queryStr, mode: MODE } },
              ...(matchingWealthTypes.length ? [{ type: { in: matchingWealthTypes } }] : []),
            ],
          },
          select: {
            id: true,
            name: true,
            type: true,
            currency: true,
            currentBalance: true,
            status: true,
          },
          take: limit,
          orderBy: { updatedAt: "desc" },
        }),

        // App Credentials (names and usernames only - NO passwords)
        prisma.appCredential.findMany({
          where: {
            vault: { userId: user.id },
            OR: [
              { name: { contains: queryStr, mode: MODE } },
              { username: { contains: queryStr, mode: MODE } },
              { url: { contains: queryStr, mode: MODE } },
            ],
          },
          select: {
            id: true,
            name: true,
            username: true,
            url: true,
            icon: true,
            iconColor: true,
            isFavorite: true,
          },
          take: limit,
          orderBy: { updatedAt: "desc" },
        }),

        // Bank Credentials (names and usernames only - NO PINs or passwords)
        prisma.bankCredential.findMany({
          where: {
            vault: { userId: user.id },
            OR: [
              { name: { contains: queryStr, mode: MODE } },
              { username: { contains: queryStr, mode: MODE } },
            ],
          },
          select: {
            id: true,
            name: true,
            username: true,
            icon: true,
            iconColor: true,
            isFavorite: true,
          },
          take: limit,
          orderBy: { updatedAt: "desc" },
        }),

        // Reminders
        prisma.reminder.findMany({
          where: {
            userId: user.id,
            OR: [
              { title: { contains: queryStr, mode: MODE } },
              ...(matchingCategories.length ? [{ category: { in: matchingCategories } }] : []),
            ],
          },
          select: {
            id: true,
            title: true,
            category: true,
            dueAt: true,
            recurrence: true,
            isCompleted: true,
          },
          take: limit,
          orderBy: { dueAt: "asc" },
        }),
      ]);

    // Format results uniformly
    const formattedDocs = documents.map((doc) => ({
      id: doc.id,
      title: doc.name,
      subtitle: doc.folder?.name ? `In ${doc.folder.name}` : "Unfiled document",
      url: `/documents/${doc.id}`,
      type: "document" as const,
      meta: doc.mimeType?.includes("pdf") ? "PDF" : "Image",
    }));

    const formattedFolders = folders.map((folder) => ({
      id: folder.id,
      title: folder.name,
      subtitle: `${folder._count.documents} document${folder._count.documents === 1 ? "" : "s"}`,
      url: `/folders/${folder.id}`,
      type: "folder" as const,
      meta: "Folder",
    }));

    const formattedWealth = wealthAccounts.map((acc) => ({
      id: acc.id,
      title: acc.name,
      subtitle: `${acc.type.replace(/_/g, " ")} • ${acc.currency} ${Number(acc.currentBalance).toLocaleString()}`,
      url: `/wealth/accounts/${acc.id}`,
      type: "wealth" as const,
      meta: acc.status,
    }));

    const formattedCredentials = [
      ...appCredentials.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.username || c.url || "App account",
        url: `/credentials`,
        type: "credential" as const,
        meta: "App",
        icon: c.icon,
        iconColor: c.iconColor,
      })),
      ...bankCredentials.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.username || "Bank account",
        url: `/credentials`,
        type: "credential" as const,
        meta: "Bank",
        icon: c.icon,
        iconColor: c.iconColor,
      })),
    ].slice(0, limit);

    const formattedReminders = reminders.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: `Due ${new Date(r.dueAt).toLocaleDateString()} • ${r.category}`,
      url: `/reminders`,
      type: "reminder" as const,
      meta: r.isCompleted ? "Completed" : "Active",
    }));

    const totalCount =
      formattedDocs.length +
      formattedFolders.length +
      formattedWealth.length +
      formattedCredentials.length +
      formattedReminders.length;

    return NextResponse.json({
      query: q,
      results: {
        documents: formattedDocs,
        folders: formattedFolders,
        wealth: formattedWealth,
        credentials: formattedCredentials,
        reminders: formattedReminders,
      },
      totalCount,
    });
  } catch (error) {
    console.error("GET /api/search/omni error:", error);
    return NextResponse.json({ error: "Failed to perform search." }, { status: 500 });
  }
}

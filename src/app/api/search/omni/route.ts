import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WealthAccountType, ReminderCategory } from "@prisma/client";
import { z } from "zod";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

const MODE = "insensitive" as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Relevance score for a candidate title against the query.
 * Higher is better; all candidates already passed a `contains` filter, so
 * this only re-orders by match quality (exact > prefix > word-start > substring).
 */
function scoreMatch(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 60;
  if (new RegExp(`\\b${escapeRegExp(q)}`).test(t)) return 40;
  return 20;
}

/** Sort by relevance then keep original (recency) order for ties. */
function rankByRelevance<T>(items: T[], query: string, getTitle: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, score: scoreMatch(getTitle(item), query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.searchOmni,
    });
    if (rateLimited) return rateLimited;

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
          take: limit * 4,
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
          take: limit * 4,
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
          take: limit * 4,
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
          take: limit * 4,
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
          take: limit * 4,
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
          take: limit * 4,
          orderBy: { dueAt: "asc" },
        }),
      ]);

    // Format results uniformly, then re-rank by match quality and slice to limit
    const formattedDocs = rankByRelevance(
      documents.map((doc) => ({
        id: doc.id,
        title: doc.name,
        subtitle: doc.folder?.name ? `In ${doc.folder.name}` : "Unfiled document",
        url: `/documents/${doc.id}`,
        type: "document" as const,
        meta: doc.mimeType?.includes("pdf") ? "PDF" : "Image",
      })),
      queryStr,
      (d) => d.title,
    ).slice(0, limit);

    const formattedFolders = rankByRelevance(
      folders.map((folder) => ({
        id: folder.id,
        title: folder.name,
        subtitle: `${folder._count.documents} document${folder._count.documents === 1 ? "" : "s"}`,
        url: `/folders/${folder.id}`,
        type: "folder" as const,
        meta: "Folder",
      })),
      queryStr,
      (f) => f.title,
    ).slice(0, limit);

    const formattedWealth = rankByRelevance(
      wealthAccounts.map((acc) => ({
        id: acc.id,
        title: acc.name,
        subtitle: `${acc.type.replace(/_/g, " ")} • ${acc.currency} ${Number(acc.currentBalance).toLocaleString()}`,
        url: `/wealth/accounts/${acc.id}`,
        type: "wealth" as const,
        meta: acc.status,
      })),
      queryStr,
      (w) => w.title,
    ).slice(0, limit);

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
    ];
    const rankedCredentials = rankByRelevance(formattedCredentials, queryStr, (c) => c.title).slice(
      0,
      limit,
    );

    const formattedReminders = rankByRelevance(
      reminders.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: `Due ${new Date(r.dueAt).toLocaleDateString()} • ${r.category}`,
        url: `/reminders`,
        type: "reminder" as const,
        meta: r.isCompleted ? "Completed" : "Active",
      })),
      queryStr,
      (r) => r.title,
    ).slice(0, limit);

    const totalCount =
      formattedDocs.length +
      formattedFolders.length +
      formattedWealth.length +
      rankedCredentials.length +
      formattedReminders.length;

    // When nothing matches, offer recent items so the palette isn't a dead end.
    let suggestions: typeof formattedDocs = [];
    if (totalCount === 0) {
      const recentDocs = await prisma.document.findMany({
        where: {
          ownerId: user.id,
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          folder: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      });
      suggestions = recentDocs.map((doc) => ({
        id: doc.id,
        title: doc.name,
        subtitle: doc.folder?.name ? `In ${doc.folder.name}` : "Unfiled document",
        url: `/documents/${doc.id}`,
        type: "document" as const,
        meta: doc.mimeType?.includes("pdf") ? "PDF" : "Image",
      }));
    }

    return NextResponse.json({
      query: q,
      results: {
        documents: formattedDocs,
        folders: formattedFolders,
        wealth: formattedWealth,
        credentials: rankedCredentials,
        reminders: formattedReminders,
      },
      suggestions,
      totalCount,
    });
  } catch (error) {
    console.error("GET /api/search/omni error:", error);
    return NextResponse.json({ error: "Failed to perform search." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

const MODE = "insensitive" as const;

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.search,
    });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(req.url);
    const parsed = z
      .object({
        q: z.string().trim().max(200).default(""),
        limit: z.coerce.number().int().min(1).max(50).default(25),
        page: z.coerce.number().int().min(1).max(100).default(1),
        fileType: z.enum(["application/pdf", "image/"]).optional(),
        aiStatus: z
          .enum(["NOT_REQUESTED", "QUEUED", "PROCESSING", "COMPLETED", "FAILED"])
          .optional(),
        dateFrom: z.string().max(40).optional(),
        dateTo: z.string().max(40).optional(),
        tags: z.string().max(500).optional(),
      })
      .safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid search parameters." }, { status: 400 });
    const {
      q,
      limit: maxLimit,
      page,
      fileType = "",
      aiStatus = "",
      dateFrom = "",
      dateTo = "",
      tags = "",
    } = parsed.data;

    if (!q) {
      return NextResponse.json({ documents: [] });
    }

    const queryStr = q.trim().toLowerCase();
    const queryWords = queryStr.split(/[\s,._-]+/).filter((w: string) => w.length > 1);

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
    const sharedFolderIds = sharedFolderRows.map((row) => row.id);

    const where: {
      AND: Record<string, unknown>[];
      mimeType?: unknown;
      aiProcessing?: unknown;
      createdAt?: unknown;
      tags?: unknown;
    } = {
      AND: [
        {
          OR: [
            { ownerId: user.id },
            ...(sharedFolderIds.length ? [{ folderId: { in: sharedFolderIds } }] : []),
            {
              owner: {
                familyMembershipsOwned: { some: { memberId: user.id, shareDocuments: true } },
              },
            },
          ],
        },
        {
          OR: [
            { name: { contains: queryStr, mode: MODE } },
            { folder: { name: { contains: queryStr, mode: MODE } } },
            { tags: { some: { tag: { name: { contains: queryStr, mode: MODE } } } } },
            { aiProcessing: { summaryMarkdown: { contains: queryStr, mode: MODE } } },
          ],
        },
      ],
    };

    if (queryWords.length >= 2) {
      const textFilters = where.AND[1].OR as Record<string, unknown>[];
      for (const word of queryWords) {
        textFilters.push({ name: { contains: word, mode: MODE } });
        textFilters.push({ folder: { name: { contains: word, mode: MODE } } });
      }
      textFilters.push({
        AND: [
          { folder: { name: { contains: queryWords[0], mode: MODE } } },
          { name: { contains: queryWords.slice(1).join(" "), mode: MODE } },
        ],
      });
    }

    if (fileType) {
      where.mimeType = { startsWith: fileType };
    }

    if (aiStatus) {
      where.AND.push({ aiProcessing: { status: aiStatus } });
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom && Number.isFinite(Date.parse(dateFrom))) dateFilter.gte = new Date(dateFrom);
      if (dateTo && Number.isFinite(Date.parse(dateTo))) dateFilter.lte = new Date(dateTo);
      if (Object.keys(dateFilter).length) where.AND.push({ createdAt: dateFilter });
    }

    if (tags) {
      const tagList = tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      if (tagList.length > 0) {
        where.AND.push({ tags: { some: { tag: { name: { in: tagList } } } } });
      }
    }

    const start = (page - 1) * maxLimit;
    const [totalCandidates, candidateDocuments] = await Promise.all([
      prisma.document.count({ where: where as never }),
      prisma.document.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip: start,
        take: maxLimit,
        include: {
          owner: { select: { id: true, name: true } },
          folder: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
          aiProcessing: { select: { status: true, summaryMarkdown: true } },
        },
      }),
    ]);

    const scoredDocs = [];

    for (const doc of candidateDocuments) {
      const isOwner = doc.ownerId === user.id;
      const docNameLower = doc.name.toLowerCase();
      const folderNameLower = doc.folder?.name?.toLowerCase() || "";
      const fullPathLower = `${folderNameLower}/${docNameLower}`;
      const tagNames = doc.tags.map((t) => t.tag.name.toLowerCase());

      let score = 0;

      if (docNameLower === queryStr) score += 200;
      else if (docNameLower.startsWith(queryStr)) score += 150;
      else if (docNameLower.includes(queryStr)) score += 120;

      if (fullPathLower.includes(queryStr)) score += 100;

      if (folderNameLower === queryStr) score += 80;
      else if (folderNameLower.includes(queryStr)) score += 60;

      if (queryWords.length >= 2) {
        const folderMatch = queryWords.filter((w: string) => folderNameLower.includes(w)).length;
        const nameMatch = queryWords.filter((w: string) => docNameLower.includes(w)).length;
        if (folderMatch > 0 && nameMatch > 0) {
          score += 80 + (folderMatch + nameMatch) * 20;
        } else if (folderMatch > 0) {
          score += folderMatch * 30;
        } else if (nameMatch > 0) {
          score += nameMatch * 25;
        }
      }

      for (const word of queryWords) {
        if (docNameLower.includes(word)) score += 15;
        if (folderNameLower.includes(word)) score += 10;
      }

      if (tagNames.some((tag) => tag.includes(queryStr) || queryStr.includes(tag))) score += 40;
      for (const word of queryWords) {
        if (tagNames.some((tag) => tag.includes(word))) score += 10;
      }

      if (doc.aiProcessing?.summaryMarkdown?.toLowerCase().includes(queryStr)) score += 10;

      scoredDocs.push({
        ...doc,
        ownershipType: isOwner ? "Owned by me" : "Shared with me",
        score,
      });
    }

    scoredDocs.sort(
      (a, b) =>
        b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return NextResponse.json(
      {
        documents: scoredDocs,
        pagination: {
          page,
          pageSize: maxLimit,
          total: totalCandidates,
          hasMore: start + candidateDocuments.length < totalCandidates,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}

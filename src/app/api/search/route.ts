import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess } from "@/lib/authz";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";
    const limitParam = searchParams.get("limit");
    const maxLimit = limitParam ? parseInt(limitParam, 10) : 50;

    if (!q.trim()) {
      return NextResponse.json({ documents: [] });
    }

    const queryStr = q.trim().toLowerCase();

    // 1. Fetch candidate documents matching query by name, tag, folder, or AI summary
    const candidateDocuments = await prisma.document.findMany({
      where: {
        OR: [
          { name: { contains: queryStr, mode: "insensitive" } },
          { folder: { name: { contains: queryStr, mode: "insensitive" } } },
          { tags: { some: { tag: { name: { contains: queryStr, mode: "insensitive" } } } } },
          { aiProcessing: { summaryMarkdown: { contains: queryStr, mode: "insensitive" } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        aiProcessing: { select: { status: true, summaryMarkdown: true } },
      },
      take: 100,
    });

    // 2. Perform security authorization check & compute Priority Score
    const scoredDocs = [];

    for (const doc of candidateDocuments) {
      const access = await checkDocumentAccess(user.id, doc.id);
      if (access.hasAccess) {
        const docNameLower = doc.name.toLowerCase();
        const folderNameLower = doc.folder?.name?.toLowerCase() || "";
        const tagNames = doc.tags.map((t) => t.tag.name.toLowerCase());

        let score = 0;

        // Exact or prefix name match
        if (docNameLower === queryStr) score += 100;
        else if (docNameLower.startsWith(queryStr)) score += 80;
        else if (docNameLower.includes(queryStr)) score += 60;

        // Tag match
        if (tagNames.some((tag) => tag.includes(queryStr))) score += 40;

        // Folder name match
        if (folderNameLower.includes(queryStr)) score += 30;

        // AI Summary match
        if (doc.aiProcessing?.summaryMarkdown?.toLowerCase().includes(queryStr)) score += 10;

        scoredDocs.push({
          ...doc,
          ownershipType: access.isOwner ? "Owned by me" : "Shared with me",
          score,
        });
      }
    }

    // Sort by Priority Score descending, then by creation date
    scoredDocs.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const finalDocs = scoredDocs.slice(0, maxLimit);

    return NextResponse.json({ documents: finalDocs });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}

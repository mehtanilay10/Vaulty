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

    if (!q.trim()) {
      return NextResponse.json({ documents: [] });
    }

    const queryStr = q.trim();

    // 1. Fetch candidate documents matching query by name, tag, or AI summary
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
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // 2. Perform security authorization check for every candidate document
    const authorizedDocs = [];

    for (const doc of candidateDocuments) {
      const access = await checkDocumentAccess(user.id, doc.id);
      if (access.hasAccess) {
        authorizedDocs.push({
          ...doc,
          ownershipType: access.isOwner ? "Owned by me" : "Shared with me",
        });
      }
    }

    return NextResponse.json({ documents: authorizedDocs });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}

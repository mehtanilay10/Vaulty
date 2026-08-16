import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { checkDocumentAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const access = await checkDocumentAccess(user.id, id);
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: "You do not have permission to access this document." },
        { status: 403 }
      );
    }

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { blobUrl: true, mimeType: true, name: true },
    });

    if (!doc || !doc.blobUrl) {
      return NextResponse.json({ error: "Document file not found." }, { status: 404 });
    }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const fileRes = await fetch(doc.blobUrl, {
      headers: blobToken ? { Authorization: `Bearer ${blobToken}` } : {},
    });

    if (!fileRes.ok) {
      // Fallback direct fetch if token header format differs
      const directRes = await fetch(doc.blobUrl);
      if (!directRes.ok) {
        return NextResponse.json({ error: "Failed to fetch document blob." }, { status: 500 });
      }
      const buffer = await directRes.arrayBuffer();
      return new Response(buffer, {
        headers: {
          "Content-Type": doc.mimeType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const fileBuffer = await fileRes.arrayBuffer();
    return new Response(fileBuffer, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error streaming private blob file:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving the document file." },
      { status: 500 }
    );
  }
}

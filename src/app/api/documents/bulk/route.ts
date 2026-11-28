import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { deleteDocumentWithStorage } from "@/lib/document-delete";

const MAX_BULK_DOCUMENTS = 50;

const bulkSchema = z
  .object({
    action: z.enum(["move", "delete"]),
    documentIds: z.array(z.string().min(1).max(128)).min(1).max(MAX_BULK_DOCUMENTS),
    folderId: z.string().min(1).max(128).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.documentsBulk,
    });
    if (rateLimited) return rateLimited;

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid bulk request." }, { status: 400 });
    }
    const { action, documentIds, folderId } = parsed.data;
    const uniqueIds = Array.from(new Set(documentIds));

    // Only documents the user owns can be bulk-modified — shared/family docs are read-only here.
    const ownedDocs = await prisma.document.findMany({
      where: { id: { in: uniqueIds }, ownerId: user.id },
      select: {
        id: true,
        name: true,
        folderId: true,
        storageProvider: true,
        storageFileId: true,
        googleDriveSummaryFileId: true,
        googleDriveTextFileId: true,
        googleDriveInterpretationFileId: true,
      },
    });
    const skipped = uniqueIds.length - ownedDocs.length;

    if (action === "move") {
      if (!folderId) {
        return NextResponse.json(
          { error: "A destination folder is required to move documents." },
          { status: 400 },
        );
      }
      const targetFolder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { ownerId: true },
      });
      if (!targetFolder || targetFolder.ownerId !== user.id) {
        return NextResponse.json(
          { error: "You can only move documents to folders you own." },
          { status: 403 },
        );
      }
      if (ownedDocs.length === 0) {
        return NextResponse.json({ moved: 0, skipped });
      }
      const result = await prisma.document.updateMany({
        where: { id: { in: ownedDocs.map((d) => d.id) } },
        data: { folderId },
      });
      return NextResponse.json({ moved: result.count, skipped });
    }

    // action === "delete"
    let deleted = 0;
    let failed = 0;
    const failures: string[] = [];
    for (const doc of ownedDocs) {
      const outcome = await deleteDocumentWithStorage({ userId: user.id, document: doc });
      if (outcome === "deleted") {
        deleted++;
      } else {
        failed++;
        failures.push(doc.name);
      }
    }

    return NextResponse.json({
      deleted,
      failed,
      skipped,
      ...(failures.length ? { failedNames: failures.slice(0, 10) } : {}),
    });
  } catch (error) {
    console.error("POST /api/documents/bulk error:", error);
    return NextResponse.json({ error: "Bulk action failed." }, { status: 500 });
  }
}

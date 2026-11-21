import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getVisibleDocumentWhere } from "@/lib/document-visibility";
import { apiError, apiSuccess } from "@/lib/api-response";

const QuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(50),
    q: z.string().trim().max(200).optional(),
    fileType: z.enum(["pdf", "image"]).optional(),
    aiStatus: z.enum(["NOT_REQUESTED", "QUEUED", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
    folderId: z.string().max(128).optional(),
    sort: z.enum(["recent", "oldest", "name", "opened"]).default("recent"),
    scope: z.enum(["owned", "all"]).default("owned"),
  })
  .strict();

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return apiError("Invalid document query parameters.", 400);

  const baseWhere =
    parsed.data.scope === "all" ? await getVisibleDocumentWhere(user.id) : { ownerId: user.id };
  const filters: Prisma.DocumentWhereInput[] = [baseWhere];
  if (parsed.data.q) {
    filters.push({
      OR: [
        { name: { contains: parsed.data.q, mode: "insensitive" } },
        { folder: { name: { contains: parsed.data.q, mode: "insensitive" } } },
        { tags: { some: { tag: { name: { contains: parsed.data.q, mode: "insensitive" } } } } },
      ],
    });
  }
  if (parsed.data.fileType)
    filters.push({
      mimeType: { startsWith: parsed.data.fileType === "pdf" ? "application/pdf" : "image/" },
    });
  if (parsed.data.aiStatus) filters.push({ aiProcessing: { status: parsed.data.aiStatus } });
  if (parsed.data.folderId) filters.push({ folderId: parsed.data.folderId });

  const where: Prisma.DocumentWhereInput = { AND: filters };
  const skip = (parsed.data.page - 1) * parsed.data.limit;
  const orderBy:
    Prisma.DocumentOrderByWithRelationInput | Prisma.DocumentOrderByWithRelationInput[] =
    parsed.data.sort === "name"
      ? { name: "asc" }
      : parsed.data.sort === "oldest"
        ? { createdAt: "asc" }
        : parsed.data.sort === "opened"
          ? [{ lastOpenedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }];

  const [documentsResult, totalResult] = await Promise.allSettled([
    prisma.document.findMany({
      where,
      select: {
        id: true,
        name: true,
        mimeType: true,
        sizeBytes: true,
        thumbnailUrl: true,
        expiryDate: true,
        lastOpenedAt: true,
        createdAt: true,
        updatedAt: true,
        ownerId: true,
        folderId: true,
        storageProvider: true,
        storageFileId: true,
        storageWebViewLink: true,
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        aiProcessing: {
          select: {
            status: true,
            processedAt: true,
            updatedAt: true,
            errorMessage: true,
            createdAt: true,
          },
        },
        owner: { select: { id: true, name: true, image: true } },
        shareLinks: { where: { isActive: true }, select: { id: true } },
      },
      orderBy,
      skip,
      take: parsed.data.limit,
    }),
    prisma.document.count({ where }),
  ]);

  if (documentsResult.status === "rejected") {
    console.error("Failed to load documents:", documentsResult.reason);
    return apiError("Failed to load documents.", 500);
  }
  if (totalResult.status === "rejected") {
    console.error("Failed to count documents:", totalResult.reason);
    return apiError("Failed to load documents.", 500);
  }

  const documents = documentsResult.value;
  const total = totalResult.value;

  return apiSuccess({
    documents,
    pagination: {
      page: parsed.data.page,
      pageSize: parsed.data.limit,
      total,
      hasMore: skip + documents.length < total,
    },
  });
}

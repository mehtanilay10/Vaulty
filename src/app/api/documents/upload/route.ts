import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkFolderAccess } from "@/lib/authz";
import { validateFileTypeAndExtension, getMaxUploadSize } from "@/lib/file-validation";
import { getProviderForUser } from "@/lib/storage/factory";
import { ensureAiJobAndProcessing } from "@/lib/ai/job-service";
import { GEMINI_MODEL } from "@/lib/gemini";
import type { StorageProviderType } from "@/lib/storage/provider";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { validateCSRFRequest } from "@/lib/csrf";
import { getFolderHierarchyPath } from "@/lib/folder-path";
import { userRateLimitResponse } from "@/lib/security-rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

const MAX_FOLDER_DEPTH = 20;
// Multipart framing adds a small amount of overhead on top of the file bytes.
const MULTIPART_OVERHEAD_ALLOWANCE_BYTES = 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimited = await userRateLimitResponse({
      userId: user.id,
      ...RATE_LIMITS.documentsUpload,
    });
    if (rateLimited) return rateLimited;

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const maxSize = getMaxUploadSize();
    const maxMb = Math.round(maxSize / (1024 * 1024));
    const contentLength = Number(req.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > maxSize + MULTIPART_OVERHEAD_ALLOWANCE_BYTES
    ) {
      return NextResponse.json(
        { error: `File size exceeds maximum limit of ${maxMb}MB.` },
        { status: 413 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folderId = formData.get("folderId") as string | null;
    const customName = formData.get("name") as string | null;
    const tagsInput = formData.get("tags") as string | null;
    const generateAi = formData.get("generateAi") === "true";
    const thumbnailDataUrl = formData.get("thumbnail") as string | null;
    const expiryDateInput = formData.get("expiryDate") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No document file provided." }, { status: 400 });
    }

    if (!folderId || typeof folderId !== "string" || !folderId.trim()) {
      return NextResponse.json({ error: "Target folder is required." }, { status: 400 });
    }

    const folderAccess = await checkFolderAccess(user.id, folderId.trim());
    if (!folderAccess.hasAccess) {
      return NextResponse.json({ error: "Target folder not found." }, { status: 404 });
    }
    if (!folderAccess.isOwner) {
      return NextResponse.json(
        { error: "You can only upload documents to folders you own." },
        { status: 403 },
      );
    }

    const validation = validateFileTypeAndExtension(file.name, file.type);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds maximum limit of ${maxMb}MB.` },
        { status: 413 },
      );
    }

    const docName = (customName && customName.trim()) || file.name;

    const storageProvider: StorageProviderType = "GOOGLE_DRIVE";

    let storageFileId: string | null = null;
    let storageParentId: string | null = null;
    let storageModifiedAt: Date | null = null;
    let storageChecksum: string | null = null;
    let storageVersion: string | null = null;
    let storageWebViewLink: string | null = null;

    try {
      const { provider } = await getProviderForUser(user.id, storageProvider);
      const vaultyFolders = await provider.ensureVaultyFolders();
      const docsFolderId = vaultyFolders.docs;

      let targetDriveParentId = docsFolderId;

      if (folderId) {
        const vaultyFolder = await prisma.folder.findUnique({
          where: { id: folderId },
          select: { name: true, parentId: true, storageFolderId: true },
        });

        if (vaultyFolder?.storageFolderId) {
          targetDriveParentId = vaultyFolder.storageFolderId;
        } else if (vaultyFolder) {
          const pathNames = await getFolderHierarchyPath(folderId);
          if (pathNames.length > MAX_FOLDER_DEPTH) {
            return NextResponse.json(
              {
                error: `Folder hierarchy exceeds the maximum supported depth of ${MAX_FOLDER_DEPTH} levels.`,
              },
              { status: 400 },
            );
          }

          targetDriveParentId = await provider.createFolderPath(pathNames, docsFolderId);
          await prisma.folder.update({
            where: { id: folderId },
            data: { storageFolderId: targetDriveParentId },
          });
        }
      }

      const cleanFileName = docName.replace(/[/\\?%*:|"<>]/g, "_");

      const uploadResult = await provider.uploadFile({
        filename: cleanFileName,
        mimeType: file.type || "application/octet-stream",
        data: Buffer.from(await file.arrayBuffer()),
        parentId: targetDriveParentId,
      });

      storageFileId = uploadResult.id;
      storageParentId = uploadResult.parentId || null;
      storageModifiedAt = uploadResult.modifiedAt;
      storageChecksum = uploadResult.checksum || null;
      storageVersion = uploadResult.version || null;
      storageWebViewLink = uploadResult.webViewLink || null;
    } catch (driveError: unknown) {
      console.error("Google Drive upload failed:", driveError);
      throw new Error(
        (driveError as { message?: string })?.message ||
          "Google Drive upload failed. Please check your Drive connection.",
      );
    }

    let thumbnailUrl: string | null = null;

    const MAX_THUMBNAIL_BYTES = 64 * 1024; // 64 KB limit for inline base64 thumbnails
    if (
      thumbnailDataUrl &&
      typeof thumbnailDataUrl === "string" &&
      thumbnailDataUrl.length <= MAX_THUMBNAIL_BYTES &&
      /^data:image\/(png|jpeg|webp|gif);base64,/i.test(thumbnailDataUrl)
    ) {
      thumbnailUrl = thumbnailDataUrl;
    }

    // Parse expiry date if provided
    let expiryDate: Date | null = null;
    if (expiryDateInput) {
      const parsed = new Date(expiryDateInput);
      if (!isNaN(parsed.getTime())) {
        expiryDate = parsed;
      }
    }

    const document = await prisma.document.create({
      data: {
        name: docName,
        thumbnailUrl,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        folderId: folderId,
        ownerId: user.id,
        storageProvider: "GOOGLE_DRIVE",
        storageFileId,
        storageParentId,
        storageModifiedAt,
        storageChecksum,
        storageVersion,
        storageWebViewLink,
        storageStatus: "ACTIVE",
        expiryDate,
      },
    });

    if (tagsInput) {
      const rawTags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);
      const uniqueTags = [...new Set(rawTags)];

      if (uniqueTags.length > 0) {
        // Batch resolve tags to eliminate N+1 queries
        const existingTags = await prisma.tag.findMany({
          where: { name: { in: uniqueTags } },
          select: { id: true, name: true },
        });
        const existingMap = new Map(existingTags.map((t) => [t.name, t.id]));
        const missingNames = uniqueTags.filter((name) => !existingMap.has(name));

        if (missingNames.length > 0) {
          await prisma.tag.createMany({
            data: missingNames.map((name) => ({ name })),
            skipDuplicates: true,
          });
          const createdTags = await prisma.tag.findMany({
            where: { name: { in: missingNames } },
            select: { id: true, name: true },
          });
          for (const t of createdTags) {
            existingMap.set(t.name, t.id);
          }
        }

        const tagIds = uniqueTags
          .map((name) => existingMap.get(name))
          .filter((id): id is string => Boolean(id));

        if (tagIds.length > 0) {
          await prisma.documentTag.createMany({
            data: tagIds.map((tagId) => ({
              documentId: document.id,
              tagId,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    if (generateAi) {
      await ensureAiJobAndProcessing(document.id, GEMINI_MODEL);
    }

    await createAuditLog({
      userId: user.id,
      action: "DOCUMENT_UPLOAD",
      documentId: document.id,
      folderId: folderId,
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
      metadata: {
        documentName: document.name,
        sizeBytes: document.sizeBytes,
        storageProvider,
        storageFileId: storageFileId || undefined,
      },
    });

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    console.error("POST /api/documents/upload error:", error);
    return NextResponse.json(
      { error: "Document upload failed. Please try again." },
      { status: 500 },
    );
  }
}

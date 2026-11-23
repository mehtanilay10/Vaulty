import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface NoteImageItem {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const { id } = await params;
    const note = await prisma.notePage.findUnique({
      where: { id },
    });

    if (!note || note.userId !== user.id) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") || "";
    let imageItem: NoteImageItem;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No image file provided." }, { status: 400 });
      }

      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: "Unsupported image format. Allowed: JPEG, PNG, WebP, GIF, SVG." },
          { status: 400 },
        );
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json({ error: "Image size exceeds 5MB limit." }, { status: 413 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
      imageItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || "Image",
        url: dataUrl,
        mimeType: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      };
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.url !== "string" || !body.url.startsWith("data:image/")) {
        return NextResponse.json({ error: "Valid image data URL is required." }, { status: 400 });
      }

      imageItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: typeof body.name === "string" ? body.name : "Image",
        url: body.url,
        mimeType: typeof body.mimeType === "string" ? body.mimeType : "image/png",
        size: typeof body.size === "number" ? body.size : Math.round(body.url.length * 0.75),
        createdAt: new Date().toISOString(),
      };
    }

    const existingImages: NoteImageItem[] = Array.isArray(note.images)
      ? (note.images as unknown as NoteImageItem[])
      : [];
    const updatedImages = [...existingImages, imageItem];

    const updatedNote = await prisma.notePage.update({
      where: { id },
      data: {
        images: updatedImages as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(
      {
        image: imageItem,
        images: updatedImages,
        note: updatedNote,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/notes/[id]/images error:", error);
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const imageId = searchParams.get("imageId");

    if (!imageId) {
      return NextResponse.json({ error: "imageId parameter is required." }, { status: 400 });
    }

    const note = await prisma.notePage.findUnique({
      where: { id },
    });

    if (!note || note.userId !== user.id) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    const existingImages: NoteImageItem[] = Array.isArray(note.images)
      ? (note.images as unknown as NoteImageItem[])
      : [];
    const updatedImages = existingImages.filter((img) => img.id !== imageId);

    await prisma.notePage.update({
      where: { id },
      data: {
        images: updatedImages as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, images: updatedImages });
  } catch (error) {
    console.error("DELETE /api/notes/[id]/images error:", error);
    return NextResponse.json({ error: "Failed to delete image." }, { status: 500 });
  }
}

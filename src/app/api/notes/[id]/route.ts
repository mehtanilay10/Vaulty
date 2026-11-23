import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { hasFamilyModuleAccess } from "@/lib/family-access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const todoItemSchema = z.object({
  id: z.string(),
  text: z.string().max(500),
  completed: z.boolean(),
});

const imageItemSchema = z.object({
  id: z.string(),
  name: z.string().max(255),
  url: z.string(),
  size: z.number().optional(),
  mimeType: z.string().optional(),
  createdAt: z.string().optional(),
});

const updateNoteSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").max(200, "Title is too long").optional(),
  content: z.string().max(5000000).optional().nullable(),
  todos: z.array(todoItemSchema).optional().nullable(),
  images: z.array(imageItemSchema).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const note = await prisma.notePage.findUnique({
      where: { id },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    // Check ownership or family access
    if (note.userId !== user.id) {
      const allowed = await hasFamilyModuleAccess(user.id, note.userId, "notes");
      if (!allowed) {
        return NextResponse.json({ error: "Note not found." }, { status: 404 });
      }
    }

    return NextResponse.json({ note }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/notes/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch note." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.notePage.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = updateNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update data." },
        { status: 400 },
      );
    }

    const updateData: Prisma.NotePageUpdateInput = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
    if (parsed.data.todos !== undefined) {
      updateData.todos = parsed.data.todos
        ? (parsed.data.todos as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull;
    }
    if (parsed.data.images !== undefined) {
      updateData.images = parsed.data.images
        ? (parsed.data.images as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull;
    }
    if (parsed.data.color !== undefined) updateData.color = parsed.data.color;
    if (parsed.data.isPinned !== undefined) updateData.isPinned = parsed.data.isPinned;
    if (parsed.data.isArchived !== undefined) updateData.isArchived = parsed.data.isArchived;

    const updatedNote = await prisma.notePage.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ note: updatedNote });
  } catch (error) {
    console.error("PATCH /api/notes/[id] error:", error);
    return NextResponse.json({ error: "Failed to update note." }, { status: 500 });
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
    const existing = await prisma.notePage.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    await prisma.notePage.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/notes/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete note." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";

const todoItemSchema = z.object({
  id: z.string(),
  text: z.string().max(500),
  completed: z.boolean(),
});

const createNoteSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
  content: z.string().max(5000000).optional().nullable(),
  todos: z.array(todoItemSchema).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  isPinned: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || searchParams.get("search") || "").trim();
    const showArchived = searchParams.get("archived") === "true";

    const notes = await prisma.notePage.findMany({
      where: {
        userId: user.id,
        isArchived: showArchived,
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { content: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ notes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/notes error:", error);
    return NextResponse.json({ error: "Failed to fetch notes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid note data." },
        { status: 400 },
      );
    }

    const { title, content, todos, color, isPinned } = parsed.data;

    const note = await prisma.notePage.create({
      data: {
        userId: user.id,
        title,
        content: content ?? null,
        todos: todos ? (todos as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        color: color ?? null,
        isPinned: isPinned ?? false,
      },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json({ error: "Failed to create note." }, { status: 500 });
  }
}

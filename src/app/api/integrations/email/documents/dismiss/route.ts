import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { z } from "zod";

const dismissSchema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = dismissSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const { id, ids, all } = parsed.data;

    const filter = all ? {} : ids && ids.length > 0 ? { id: { in: ids } } : { id: id ? id : "" };

    const result = await prisma.emailDocumentImport.updateMany({
      where: {
        ownerId: user.id,
        status: "PENDING",
        ...filter,
      },
      data: {
        status: "DISMISSED",
      },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("POST /api/integrations/email/documents/dismiss error:", error);
    return NextResponse.json({ error: "Failed to dismiss document(s)." }, { status: 500 });
  }
}

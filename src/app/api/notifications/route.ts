import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import {
  getUnreadNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/notifications";
import { z } from "zod";
import { validateCSRFRequest } from "@/lib/csrf";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(25),
        cursor: z.string().min(1).max(128).optional(),
      })
      .safeParse({
        limit: req.nextUrl.searchParams.get("limit") ?? undefined,
        cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
      });
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid pagination parameters." }, { status: 400 });
    const result = await getUnreadNotifications(user.id, parsed.data.limit, parsed.data.cursor);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    const parsed = z
      .object({
        markAllRead: z.boolean().optional(),
        id: z.string().min(1).max(128).optional(),
        notificationId: z.string().min(1).max(128).optional(),
        read: z.boolean().optional(),
      })
      .strict()
      .refine((data) => data.markAllRead !== undefined || Boolean(data.id || data.notificationId), {
        message: "Either markAllRead or a notification ID is required.",
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid notification request." },
        { status: 400 },
      );

    if (parsed.data.markAllRead) {
      await markAllNotificationsAsRead(user.id);
    } else {
      const targetId = parsed.data.id || parsed.data.notificationId;
      if (targetId) {
        await markNotificationAsRead(targetId, user.id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to update notifications." }, { status: 500 });
  }
}

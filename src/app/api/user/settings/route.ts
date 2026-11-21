import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { validateCSRFRequest } from "@/lib/csrf";

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    const parsed = z
      .object({ defaultStorageProvider: z.literal("GOOGLE_DRIVE") })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid storage provider." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { defaultStorageProvider: parsed.data.defaultStorageProvider },
    });

    return NextResponse.json({
      success: true,
      defaultStorageProvider: parsed.data.defaultStorageProvider,
    });
  } catch (error) {
    console.error("PATCH /api/user/settings error:", error);
    return NextResponse.json({ error: "Failed to update settings." }, { status: 500 });
  }
}

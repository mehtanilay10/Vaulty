import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { defaultStorageProvider } = body;

    if (!["GOOGLE_DRIVE", "VERCEL_BLOB"].includes(defaultStorageProvider)) {
      return NextResponse.json({ error: "Invalid storage provider." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { defaultStorageProvider: defaultStorageProvider as "GOOGLE_DRIVE" | "VERCEL_BLOB" },
    });

    return NextResponse.json({ success: true, defaultStorageProvider });
  } catch (error) {
    console.error("PATCH /api/user/settings error:", error);
    return NextResponse.json({ error: "Failed to update settings." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit-log";
import { validateCSRFRequest } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req))
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    await prisma.outlookConnection.deleteMany({ where: { ownerId: user.id } });
    await createAuditLog({ userId: user.id, action: "OUTLOOK_DISCONNECT" });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Outlook disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect Outlook." }, { status: 500 });
  }
}

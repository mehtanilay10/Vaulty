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

    const connection = await prisma.gmailConnection.findUnique({ where: { ownerId: user.id } });
    if (!connection) return NextResponse.json({ success: true });

    // Do not call Google's token revocation endpoint here. Gmail, Drive and
    // Auth.js share one OAuth project; Google revocation can invalidate every
    // scope granted to that project, which would unexpectedly break Drive too.
    // Removing this encrypted credential is enough to stop Vaulty Gmail access.
    await prisma.gmailConnection.delete({ where: { ownerId: user.id } });
    await createAuditLog({ userId: user.id, action: "GMAIL_DISCONNECT" });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Gmail disconnect error:", error);
    return NextResponse.json({ error: "Failed to disconnect Gmail." }, { status: 500 });
  }
}

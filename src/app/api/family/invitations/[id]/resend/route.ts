import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import { resendFamilyInvitation } from "@/lib/family-service";
import { familyErrorResponse } from "@/lib/family-http";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:invite:resend:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;
    const result = await resendFamilyInvitation({
      ownerId: user.id,
      invitationId: id,
    });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_INVITE_RESEND",
      metadata: { invitationId: id, emailSent: result.emailSent },
    });

    return NextResponse.json(result);
  } catch (error) {
    return familyErrorResponse(error);
  }
}

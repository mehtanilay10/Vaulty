import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import { rejectFamilyInvitation } from "@/lib/family-service";
import { familyErrorResponse, parseJsonBody } from "@/lib/family-http";
import { z } from "zod";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

const rejectInvitationSchema = z.object({
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:invite:reject:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const body = parseJsonBody(await req.json(), rejectInvitationSchema);
    const token = body.token.trim();

    await rejectFamilyInvitation({
      userId: user.id,
      userEmail: user.email,
      token,
    });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_INVITE_REJECT",
      metadata: { token: `${token.slice(0, 6)}…` },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

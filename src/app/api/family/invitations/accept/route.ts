import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import { acceptFamilyInvitation } from "@/lib/family-service";
import { familyErrorResponse } from "@/lib/family-http";
import { z } from "zod";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:invite:accept:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const parsed = z
      .object({ token: z.string().trim().min(20).max(128) })
      .strict()
      .safeParse(await req.json().catch(() => null));
    const token = parsed.success ? parsed.data.token : "";

    if (!token) {
      return NextResponse.json(
        { error: "Invitation token is required.", code: "TOKEN_REQUIRED" },
        { status: 400 },
      );
    }

    const membership = await acceptFamilyInvitation({
      userId: user.id,
      userEmail: user.email,
      token,
    });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_INVITE_ACCEPT",
      metadata: { membershipId: membership.id, ownerId: membership.ownerId },
    });

    return NextResponse.json({ membership });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

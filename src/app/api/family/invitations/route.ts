import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import { createFamilyInvitation } from "@/lib/family-service";
import { familyErrorResponse, parseJsonBody } from "@/lib/family-http";
import { isValidFamilyEmail, normalizeFamilyEmail, parseFamilyModuleFlags } from "@/types/family";
import { z } from "zod";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

const createInvitationSchema = z.object({
  email: z.string().email(),
  shareDocuments: z.boolean().optional(),
  shareWealth: z.boolean().optional(),
  shareCredentials: z.boolean().optional(),
  shareReminders: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:invite:create:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const body = parseJsonBody(await req.json(), createInvitationSchema);
    const email = normalizeFamilyEmail(body.email);
    const flags = parseFamilyModuleFlags(body);

    if (!email || !isValidFamilyEmail(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address.", code: "INVALID_EMAIL" },
        { status: 400 },
      );
    }

    if (!flags) {
      return NextResponse.json(
        {
          error: "Select at least one module to share.",
          code: "NO_MODULES",
        },
        { status: 400 },
      );
    }

    const result = await createFamilyInvitation({
      ownerId: user.id,
      email,
      flags,
    });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_INVITE",
      metadata: {
        invitationId: result.invitation.id,
        email,
        flags,
        emailSent: result.emailSent,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

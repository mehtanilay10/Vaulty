import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import { cancelFamilyInvitation, updateFamilyInvitation } from "@/lib/family-service";
import { familyErrorResponse, parseJsonBody } from "@/lib/family-http";
import { parseFamilyModuleFlags } from "@/types/family";
import { z } from "zod";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

const updateInvitationSchema = z.object({
  shareDocuments: z.boolean().optional(),
  shareWealth: z.boolean().optional(),
  shareCredentials: z.boolean().optional(),
  shareReminders: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:invite:update:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;
    const body = parseJsonBody(await req.json(), updateInvitationSchema);
    const flags = parseFamilyModuleFlags(body);

    if (!flags) {
      return NextResponse.json(
        { error: "Select at least one module to share.", code: "NO_MODULES" },
        { status: 400 },
      );
    }

    const invitation = await updateFamilyInvitation({
      ownerId: user.id,
      invitationId: id,
      flags,
    });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_INVITE_UPDATE",
      metadata: { invitationId: id, flags },
    });

    return NextResponse.json({ invitation });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:invite:delete:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;
    await cancelFamilyInvitation({ ownerId: user.id, invitationId: id });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_INVITE_CANCEL",
      metadata: { invitationId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import { revokeFamilyMembership, updateFamilyMembership } from "@/lib/family-service";
import { familyErrorResponse, parseJsonBody } from "@/lib/family-http";
import { parseFamilyModuleFlags } from "@/types/family";
import { z } from "zod";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

const updateMembershipSchema = z.object({
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

    const { allowed } = await rateLimit(`family:member:update:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;
    const body = parseJsonBody(await req.json(), updateMembershipSchema);
    const flags = parseFamilyModuleFlags(body);

    if (!flags) {
      return NextResponse.json(
        { error: "Select at least one module to share.", code: "NO_MODULES" },
        { status: 400 },
      );
    }

    const membership = await updateFamilyMembership({
      ownerId: user.id,
      membershipId: id,
      flags,
    });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_MEMBERSHIP_UPDATE",
      metadata: { membershipId: id, flags },
    });

    return NextResponse.json({ membership });
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

    const { allowed } = await rateLimit(`family:member:delete:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;
    await revokeFamilyMembership({ ownerId: user.id, membershipId: id });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_MEMBERSHIP_REVOKE",
      metadata: { membershipId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import {
  deleteWrappedFamilyCredentialKey,
  storeWrappedFamilyCredentialKey,
} from "@/lib/family-service";
import { familyErrorResponse, parseJsonBody } from "@/lib/family-http";
import { z } from "zod";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

const storeCredentialKeySchema = z.object({
  wrappedKey: z.string().min(1).max(40000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:credential-key:store:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { membershipId } = await params;
    const body = parseJsonBody(await req.json(), storeCredentialKeySchema);
    const result = await storeWrappedFamilyCredentialKey({
      userId: user.id,
      membershipId,
      wrappedKey: body.wrappedKey,
    });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_CREDENTIAL_KEY_UPDATE",
      metadata: {
        membershipId,
        keyVersion: result.keyVersion,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return familyErrorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:credential-key:delete:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { membershipId } = await params;
    const result = await deleteWrappedFamilyCredentialKey({
      userId: user.id,
      membershipId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return familyErrorResponse(error);
  }
}

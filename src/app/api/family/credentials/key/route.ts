import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import { getFamilyCredentialKeyStatus, registerFamilyCredentialKey } from "@/lib/family-service";
import { familyErrorResponse } from "@/lib/family-http";
import { z } from "zod";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

const registerKeySchema = z.object({
  publicKey: z.string().min(1).max(20000),
  encryptedPrivateKey: z.string().min(1).max(40000),
  privateKeyIv: z.string().min(1).max(256),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:credential-key:status:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    const status = await getFamilyCredentialKeyStatus(user.id);
    return NextResponse.json(status);
  } catch (error) {
    return familyErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:credential-key:register:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = registerKeySchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parseResult.error.flatten() },
        { status: 400 },
      );
    }

    const key = await registerFamilyCredentialKey({
      userId: user.id,
      publicKey: parseResult.data.publicKey,
      encryptedPrivateKey: parseResult.data.encryptedPrivateKey,
      privateKeyIv: parseResult.data.privateKeyIv,
    });

    await createAuditLog({
      userId: user.id,
      action: "FAMILY_CREDENTIAL_KEY_UPDATE",
      metadata: { publicKeyLength: key.publicKey?.length ?? 0 },
    });

    return NextResponse.json({ key });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

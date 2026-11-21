import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { getFamilySharedWealth } from "@/lib/family-service";
import { familyErrorResponse } from "@/lib/family-http";
import { hasFamilyModuleAccess } from "@/lib/family-access";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:wealth:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get("ownerId") || undefined;

    if (ownerId) {
      const allowed = await hasFamilyModuleAccess(user.id, ownerId, "wealth");
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden: No shared wealth access." }, { status: 403 });
      }
    }

    const groups = await getFamilySharedWealth(user.id, ownerId);
    return NextResponse.json({ groups: JSON.parse(JSON.stringify(groups)) });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

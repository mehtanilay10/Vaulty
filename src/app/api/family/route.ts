import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { getFamilyOverview } from "@/lib/family-service";
import { familyErrorResponse } from "@/lib/family-http";
import { rateLimit, createRateLimitResponse } from "@/lib/family-rate-limit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await rateLimit(`family:overview:${user.id}`);
    if (!allowed) return createRateLimitResponse();

    const overview = await getFamilyOverview(user.id);
    return NextResponse.json({ overview });
  } catch (error) {
    return familyErrorResponse(error);
  }
}

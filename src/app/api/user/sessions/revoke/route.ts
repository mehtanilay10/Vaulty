import { NextRequest } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);
  if (!validateCSRFRequest(req)) return apiError("Invalid CSRF token", 403);
  await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  return apiSuccess({
    success: true,
    message: "All active sessions have been invalidated. Sign in again to continue.",
  });
}

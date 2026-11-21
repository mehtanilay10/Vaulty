import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { createGmailConnectUrl } from "@/lib/gmail/oauth";
import { createAuditLog, extractIpAddress, extractUserAgent } from "@/lib/audit-log";
import { consumeSecurityAttempt } from "@/lib/security-rate-limit";
import { validateOrigin } from "@/lib/csrf";

export async function GET(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    }

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rate = await consumeSecurityAttempt({
      key: `gmail-connect:${user.id}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many Gmail connection attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds || 900) } },
      );
    }

    const authUrl = createGmailConnectUrl(user.id);
    await createAuditLog({
      userId: user.id,
      action: "GMAIL_CONNECT",
      ipAddress: extractIpAddress(req),
      userAgent: extractUserAgent(req),
      metadata: { initiated: true },
    });

    return NextResponse.json(
      { authUrl },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("GET /api/integrations/gmail/connect error:", error);
    return NextResponse.json({ error: "Could not start Gmail connection." }, { status: 500 });
  }
}

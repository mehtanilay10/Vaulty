import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, setupGoogleDriveConnection } from "@/lib/google-drive/oauth";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL("/settings?drive_error=" + encodeURIComponent(error), req.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/settings?drive_error=no_code", req.url)
      );
    }

    const tokens = await exchangeCodeForTokens(code);
    const state = searchParams.get("state");

    let userId: string | null = null;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
        userId = decoded.userId || null;
      } catch {
        // ignore state parse errors
      }
    }

    if (!userId) {
      return NextResponse.redirect(
        new URL("/settings?drive_error=invalid_state", req.url)
      );
    }

    await setupGoogleDriveConnection(userId, tokens);

    return NextResponse.redirect(new URL("/settings?drive_connected=true", req.url));
  } catch (error) {
    console.error("Google Drive callback error:", error);
    return NextResponse.redirect(
      new URL("/settings?drive_error=callback_failed", req.url)
    );
  }
}

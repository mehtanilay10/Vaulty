import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  setupGoogleDriveConnection,
  verifyGoogleDriveOAuthState,
} from "@/lib/google-drive/oauth";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/settings?drive_error=access_denied", req.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL("/settings?drive_error=no_code", req.url));
    }

    const userId = verifyGoogleDriveOAuthState(searchParams.get("state"));
    if (!userId) {
      return NextResponse.redirect(new URL("/settings?drive_error=invalid_state", req.url));
    }

    const tokens = await exchangeCodeForTokens(code);
    await setupGoogleDriveConnection(userId, tokens);

    return NextResponse.redirect(new URL("/settings?drive_connected=true", req.url));
  } catch (error) {
    console.error("Google Drive callback error:", error);
    return NextResponse.redirect(new URL("/settings?drive_error=callback_failed", req.url));
  }
}

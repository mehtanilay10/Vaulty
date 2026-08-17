import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { getGoogleDriveAuthUrl } from "@/lib/google-drive/oauth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url");
    const authUrl = getGoogleDriveAuthUrl(state);

    return NextResponse.json({ authUrl, state });
  } catch (error) {
    console.error("GET /api/integrations/google-drive/connect error:", error);
    return NextResponse.json(
      { error: "Failed to initialize Google Drive connection." },
      { status: 500 }
    );
  }
}

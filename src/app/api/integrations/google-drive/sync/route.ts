import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { syncGoogleDriveForUser } from "@/lib/sync/sync-engine";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await syncGoogleDriveForUser(user.id);

    return NextResponse.json({ result }, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error("POST /api/integrations/google-drive/sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync Google Drive." },
      { status: 500 }
    );
  }
}

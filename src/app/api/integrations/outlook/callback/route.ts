import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  decryptOutlookRefreshToken,
  encryptOutlookRefreshToken,
  exchangeOutlookCode,
  getOutlookProfile,
  verifyOutlookOAuthState,
} from "@/lib/outlook/oauth";

export async function GET(req: NextRequest) {
  const callbackUrl = new URL("/email-sync", req.url);
  if (req.nextUrl.searchParams.has("error")) {
    callbackUrl.searchParams.set("outlook_error", "access_denied");
    return NextResponse.redirect(callbackUrl);
  }
  const code = req.nextUrl.searchParams.get("code");
  const userId = verifyOutlookOAuthState(req.nextUrl.searchParams.get("state"));
  if (!code || !userId) {
    callbackUrl.searchParams.set("outlook_error", "invalid_callback");
    return NextResponse.redirect(callbackUrl);
  }

  try {
    const tokens = await exchangeOutlookCode(code);
    const email = await getOutlookProfile(tokens.accessToken);

    // Use transaction to prevent race condition between checking existing connection and upserting
    await prisma.$transaction(async (tx) => {
      const existing = await tx.outlookConnection.findUnique({ where: { ownerId: userId } });
      const sameAccount = existing?.emailAddress.toLowerCase() === email.toLowerCase();
      const refreshToken =
        tokens.refreshToken ||
        (sameAccount && existing
          ? decryptOutlookRefreshToken(existing.refreshTokenEncrypted)
          : null);
      if (!refreshToken)
        throw new Error(
          "Microsoft did not return an offline refresh token. Reconnect and approve offline access.",
        );

      await tx.outlookConnection.upsert({
        where: { ownerId: userId },
        update: {
          emailAddress: email,
          refreshTokenEncrypted: encryptOutlookRefreshToken(refreshToken),
          status: "CONNECTED",
          connectedAt: new Date(),
          ...(!sameAccount ? { syncPageToken: null, lastSyncedAt: null } : {}),
        },
        create: {
          ownerId: userId,
          emailAddress: email,
          refreshTokenEncrypted: encryptOutlookRefreshToken(refreshToken),
          status: "CONNECTED",
        },
      });
    });

    callbackUrl.searchParams.set("outlook_connected", "true");
  } catch (error) {
    console.error("Outlook OAuth callback error:", error);
    callbackUrl.searchParams.set("outlook_error", "connection_failed");
  }
  return NextResponse.redirect(callbackUrl);
}

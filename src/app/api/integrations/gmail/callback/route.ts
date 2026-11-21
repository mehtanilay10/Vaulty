import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  decryptGmailRefreshToken,
  encryptGmailRefreshToken,
  exchangeGmailCode,
  verifyGmailOAuthState,
} from "@/lib/gmail/oauth";

export async function GET(req: NextRequest) {
  const callbackUrl = new URL("/email-sync", req.url);
  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    callbackUrl.searchParams.set("gmail_error", "access_denied");
    return NextResponse.redirect(callbackUrl);
  }

  const code = req.nextUrl.searchParams.get("code");
  const userId = verifyGmailOAuthState(req.nextUrl.searchParams.get("state"));
  if (!code || !userId) {
    callbackUrl.searchParams.set("gmail_error", "invalid_callback");
    return NextResponse.redirect(callbackUrl);
  }

  try {
    const tokens = await exchangeGmailCode(code);

    // Use transaction to prevent race condition
    await prisma.$transaction(async (tx) => {
      const existing = await tx.gmailConnection.findUnique({ where: { ownerId: userId } });
      const existingTokenForSameAccount =
        existing && existing.emailAddress.toLowerCase() === tokens.email.toLowerCase()
          ? decryptGmailRefreshToken(existing.refreshTokenEncrypted)
          : null;
      const refreshToken = tokens.refreshToken || existingTokenForSameAccount;
      const accountChanged = Boolean(
        existing && existing.emailAddress.toLowerCase() !== tokens.email.toLowerCase(),
      );
      if (!refreshToken) {
        throw new Error(
          "Google did not return an offline refresh token. Reconnect and approve offline access.",
        );
      }
      await tx.gmailConnection.upsert({
        where: { ownerId: userId },
        update: {
          emailAddress: tokens.email,
          refreshTokenEncrypted: encryptGmailRefreshToken(refreshToken),
          status: "CONNECTED",
          connectedAt: new Date(),
          ...(accountChanged
            ? { syncPageToken: null, syncLookbackDays: null, lastSyncedAt: null }
            : {}),
        },
        create: {
          ownerId: userId,
          emailAddress: tokens.email,
          refreshTokenEncrypted: encryptGmailRefreshToken(refreshToken),
          status: "CONNECTED",
        },
      });
    });

    callbackUrl.searchParams.set("gmail_connected", "true");
  } catch (cause) {
    console.error("Gmail OAuth callback error:", cause);
    callbackUrl.searchParams.set("gmail_error", "connection_failed");
  }

  return NextResponse.redirect(callbackUrl);
}

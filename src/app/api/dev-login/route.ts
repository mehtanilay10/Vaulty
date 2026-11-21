import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Not allowed in non-development environments" },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email") || process.env.DEV_LOGIN_EMAIL;

  if (!email) {
    return NextResponse.json({ error: "No dev login email configured" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return NextResponse.json({ error: `User with email ${email} not found` }, { status: 404 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET missing" }, { status: 500 });
  }

  const token = {
    id: user.id,
    name: user.name,
    email: user.email,
    sub: user.id,
    sessionVersion: user.sessionVersion,
  };

  const sessionToken = await encode({
    token,
    secret,
    salt: "authjs.session-token",
  });

  const redirectUrl = new URL("/dashboard", req.url);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}

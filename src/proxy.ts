import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateCSRFToken, verifyCSRFToken } from "@/lib/csrf";
import { validateSessionVersion } from "@/lib/session-validation";

const CSRF_COOKIE_NAME = "csrf-token";

export default auth(async (req) => {
  const isLoggedIn = !!req.auth;
  const { pathname, search } = req.nextUrl;
  const pathWithQuery = `${pathname}${search}`;

  const isDev = process.env.NODE_ENV === "development";
  const publicRoutes = [
    "/",
    "/auth/signin",
    "/auth/verify-request",
    "/auth/reset-password",
    "/auth/signout",
    "/offline",
    ...(isDev ? ["/api/dev-login"] : []),
    "/sw.js",
  ];
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/integrations/google-drive/webhook") ||
    // Token-gated vault recovery endpoints. They authorize via the emailed
    // reset token (or an existing session), not the Auth.js session cookie.
    pathname === "/api/passwords/recovery/verify" ||
    pathname === "/api/passwords/recovery/rekey" ||
    pathname.startsWith("/share/") ||
    pathname.startsWith("/api/share/");

  if (!isLoggedIn && !isPublicRoute) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signInUrl = new URL("/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathWithQuery);
    return NextResponse.redirect(signInUrl);
  }

  // Validate session version for authenticated requests
  if (isLoggedIn && req.auth?.user?.id) {
    const isValid = await validateSessionVersion(
      req.auth.user.id,
      req.auth.user.sessionVersion as number | undefined,
    );

    if (!isValid) {
      // Session version mismatch - invalidate session
      const signInUrl = new URL("/auth/signin", req.nextUrl.origin);
      signInUrl.searchParams.set("callbackUrl", pathWithQuery);
      signInUrl.searchParams.set("error", "session_invalidated");
      return NextResponse.redirect(signInUrl);
    }

    if (pathname === "/auth/signin" || pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
    }
  }

  const response = NextResponse.next();

  const existingToken = req.cookies.get(CSRF_COOKIE_NAME);
  if (!existingToken || !verifyCSRFToken(existingToken.value)) {
    // Fail closed if production CSRF_SECRET is missing or misconfigured.
    const token = generateCSRFToken();
    response.cookies.set(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60,
      path: "/",
    });
  }

  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_vercel|favicon.ico|manifest.json|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)).*)",
  ],
};

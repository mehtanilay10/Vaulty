/**
 * Canonical Application Base URL helper.
 * Resolves the active base URL from environment variables:
 * NEXTAUTH_URL -> VERCEL_URL -> localhost:3000 (dev fallback)
 */
export function getAppBaseUrl(): string {
  const url =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";

  return url.replace(/\/$/, "");
}

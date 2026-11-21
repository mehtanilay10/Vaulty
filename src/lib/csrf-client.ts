/**
 * Client-side CSRF helpers.
 * Safe to import from client components: no server-only dependencies.
 */

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/constants";

export { CSRF_HEADER_NAME } from "@/lib/constants";

/**
 * Read the CSRF token from document.cookie (double-submit cookie pattern).
 * Returns null if no valid token cookie is present.
 */
export function readCSRFTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + CSRF_COOKIE_NAME + "=([^;]*)"));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Build fetch headers including the CSRF token for mutating requests.
 */
export function csrfHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = readCSRFTokenFromCookie();
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers[CSRF_HEADER_NAME] = token;
  }
  return headers;
}

const TRANSIENT_DB_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

/**
 * Returns true when the error looks like a transient database connectivity
 * problem (e.g. Neon compute suspended / cold start, pooler timeout) rather
 * than an application bug. Safe to call with any thrown value.
 */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_DB_CODES.has(code)) return true;
    if ((error as { name?: unknown }).name === "PrismaClientInitializationError") {
      return true;
    }
  }
  if (error instanceof Error) {
    return /can't reach database server|timed out fetching|connection.*(closed|terminated|refused)/i.test(
      error.message,
    );
  }
  return false;
}

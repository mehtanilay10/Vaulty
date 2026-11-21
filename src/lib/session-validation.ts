import { prisma } from "@/lib/prisma";

// In-memory cache to prevent blocking every single HTTP request with remote DB round-trips
const sessionVersionCache = new Map<string, { version: number; expiresAt: number }>();
const CACHE_TTL_MS = 300_000; // 5 minutes TTL

/**
 * Get current session version for user with in-memory caching (5m TTL).
 * Gracefully handles transient database connection failures by falling back to cached state
 * so that users are not randomly signed out when Neon pooler reconnects.
 */
export async function getUserSessionVersion(userId: string): Promise<number | null | undefined> {
  const now = Date.now();
  const cached = sessionVersionCache.get(userId);

  if (cached && cached.expiresAt > now) {
    return cached.version;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });

    if (!user) {
      // If user does not exist in DB, invalidate cache and return null
      sessionVersionCache.delete(userId);
      return null;
    }

    sessionVersionCache.set(userId, {
      version: user.sessionVersion,
      expiresAt: now + CACHE_TTL_MS,
    });
    return user.sessionVersion;
  } catch (error) {
    console.warn(
      `[session-validation] Transient DB error checking session version for user "${userId}":`,
      error,
    );
    // If DB is temporarily unavailable but we have a cached version, return cached version
    if (cached) {
      return cached.version;
    }
    // Return undefined to indicate transient failure (do not treat as deleted user)
    return undefined;
  }
}

/**
 * Validate session version to enforce immediate access revocation
 * Returns true if session is valid, false if it should be invalidated
 */
export async function validateSessionVersion(
  userId: string,
  sessionVersion?: number,
): Promise<boolean> {
  const expectedVersion = await getUserSessionVersion(userId);

  // If transient DB failure, allow existing session to proceed rather than abruptly logging out
  if (expectedVersion === undefined) {
    return true;
  }

  if (expectedVersion === null) {
    console.warn(`[session-validation] User "${userId}" not found during session version check.`);
    return false;
  }

  const suppliedVersion = sessionVersion ?? 0;
  if (expectedVersion !== suppliedVersion) {
    console.warn(
      `[session-validation] Session version mismatch for user "${userId}": expected ${expectedVersion}, got ${suppliedVersion}.`,
    );
    return false;
  }

  // Missing session version defaults to 0 so revocation (version increment)
  // immediately invalidates any session that does not carry the current version.
  return true;
}

/**
 * Increment session version to invalidate all existing sessions
 * Call this when access is revoked or security settings change
 */
export async function invalidateUserSessions(userId: string): Promise<void> {
  sessionVersionCache.delete(userId);
  await prisma.user.update({
    where: { id: userId },
    data: {
      sessionVersion: {
        increment: 1,
      },
    },
  });
}

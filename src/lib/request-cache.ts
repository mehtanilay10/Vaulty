type FetchFn = (...args: unknown[]) => Promise<unknown>;

const cache = new Map<string, { promise: Promise<unknown>; timestamp: number }>();
const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 500;

/**
 * Safely serialize arguments to JSON handling circular references and BigInt
 */
function safeSerializeArgs(args: unknown[]): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(args, (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    });
  } catch {
    return String(args);
  }
}

/**
 * Remove expired entries and enforce maximum cache size
 */
function evictOldEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      cache.delete(key);
    }
  }

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const overflow = cache.size - MAX_CACHE_ENTRIES + 1;
    let evicted = 0;
    for (const key of cache.keys()) {
      cache.delete(key);
      evicted++;
      if (evicted >= overflow) break;
    }
  }
}

export function clearRequestCache(): void {
  cache.clear();
}

export function createRequestCache(fetchFn: FetchFn, keyPrefix: string) {
  return async (...args: unknown[]) => {
    evictOldEntries();

    const key = `${keyPrefix}:${safeSerializeArgs(args)}`;
    const cached = cache.get(key);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.promise;
    }

    const promise = fetchFn(...args).catch((error) => {
      // Remove failed promise from cache so callers can retry
      cache.delete(key);
      throw error;
    });

    cache.set(key, { promise, timestamp: Date.now() });
    return promise;
  };
}

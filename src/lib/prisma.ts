import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (url.includes("-pooler.") && !url.includes("pgbouncer=true")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}pgbouncer=true&connect_timeout=15`;
  }
  return url;
}

const RETRYABLE_DB_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const MAX_READ_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;

/**
 * Only read-only operations are retried. Writes (create/update/delete/upsert/
 * executeRaw) are never retried automatically because they may not be idempotent.
 */
function isReadOperation(operation: string): boolean {
  return (
    operation.startsWith("find") ||
    operation === "count" ||
    operation === "aggregate" ||
    operation === "groupBy" ||
    operation.includes("queryRaw")
  );
}

function isRetryableDbError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && RETRYABLE_DB_CODES.has(code)) return true;
  }
  // Initialization errors (e.g. Neon cold start / suspended compute) surface
  // without a P-code but are transient — worth retrying.
  if (error instanceof Error && error.name === "PrismaClientInitializationError") {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPrismaClient() {
  const base = new PrismaClient({
    datasourceUrl: getDatasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Retry transient connectivity failures (Neon cold starts, pooler hiccups)
  // for read-only operations via a client extension.
  return base.$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        if (!isReadOperation(operation)) {
          return query(args);
        }
        let lastError: unknown;
        for (let attempt = 0; attempt < MAX_READ_RETRIES; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            lastError = error;
            if (!isRetryableDbError(error) || attempt === MAX_READ_RETRIES - 1) {
              throw error;
            }
            const jitter = Math.random() * 200;
            await sleep(RETRY_BASE_DELAY_MS * 3 ** attempt + jitter);
          }
        }
        throw lastError;
      },
    },
  });
}

export const prisma = (globalForPrisma.prisma ?? createPrismaClient()) as unknown as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

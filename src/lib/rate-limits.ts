/**
 * Central registry of per-user API rate limits.
 *
 * Each preset maps a scope to { limit, windowMs }. Values default to sane
 * production numbers but can be overridden per-deployment via env vars:
 *
 *   RATE_LIMIT_<SCOPE>_LIMIT       e.g. RATE_LIMIT_DOCUMENTS_UPLOAD_LIMIT=50
 *   RATE_LIMIT_<SCOPE>_WINDOW_MS   e.g. RATE_LIMIT_DOCUMENTS_UPLOAD_WINDOW_MS=60000
 *
 * Scope names are uppercased with dashes converted to underscores.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

interface RateLimitPreset {
  scope: string;
  limit: number;
  windowMs: number;
}

function preset(
  scope: string,
  envKey: string,
  defaultLimit: number,
  windowMs: number,
): RateLimitPreset {
  const key = envKey.toUpperCase().replace(/-/g, "_");
  return {
    scope,
    limit: envInt(`RATE_LIMIT_${key}_LIMIT`, defaultLimit),
    windowMs: envInt(`RATE_LIMIT_${key}_WINDOW_MS`, windowMs),
  };
}

export const RATE_LIMITS = {
  // Search — the command palette fires often while typing, so keep it generous.
  searchOmni: preset("search-omni", "search-omni", 120, MINUTE_MS),
  search: preset("search", "search", 60, MINUTE_MS),

  // Documents — uploads and AI jobs are the most expensive operations.
  documentsUpload: preset("documents-upload", "documents-upload", 30, MINUTE_MS),
  documentsAi: preset("documents-ai", "documents-ai", 20, MINUTE_MS),
  documentsAiBatch: preset("documents-ai-batch", "documents-ai-batch", 10, MINUTE_MS),
  documentsAppendPage: preset("documents-append-page", "documents-append-page", 10, MINUTE_MS),
  documentsShare: preset("documents-share", "documents-share", 30, MINUTE_MS),
  documentsBulk: preset("documents-bulk", "documents-bulk", 10, MINUTE_MS),

  // Notes
  notesImages: preset("notes-images", "notes-images", 30, MINUTE_MS),

  // Wealth statements — parsing can invoke AI fallbacks.
  statementsParse: preset("statements-parse", "statements-parse", 15, MINUTE_MS),
  statementsUpload: preset("statements-upload", "statements-upload", 15, MINUTE_MS),
  statementsImport: preset("statements-import", "statements-import", 20, MINUTE_MS),

  // Account data export is heavy — keep it rare.
  userTakeout: preset("user-takeout", "user-takeout", 5, HOUR_MS),

  // Password vault — PBKDF2 verify is CPU-expensive; these are defense-in-depth
  // on top of the vault's own lockout counters.
  passwordsUnlock: preset("passwords-unlock", "passwords-unlock", 15, MINUTE_MS),
  passwordsSetup: preset("passwords-setup", "passwords-setup", 10, MINUTE_MS),
  passwordsChangeMaster: preset(
    "passwords-change-master",
    "passwords-change-master",
    10,
    MINUTE_MS,
  ),
  passwordsResetConfirm: preset(
    "passwords-reset-confirm",
    "passwords-reset-confirm",
    10,
    MINUTE_MS,
  ),
  passwordsRecoverySetup: preset(
    "passwords-recovery-setup",
    "passwords-recovery-setup",
    10,
    MINUTE_MS,
  ),
} as const;

export type RateLimitScope = keyof typeof RATE_LIMITS;

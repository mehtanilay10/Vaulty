/**
 * Application Constants
 *
 * Centralized constants across Vaulty, covering security, crypto, auth,
 * storage, AI processing, integrations, wealth, and family modules.
 */

// Application Info
export const APP_NAME = "Vaulty";
export const APP_DESCRIPTION = "Personal and family information workspace";

// Crypto & Key Derivation (PBKDF2)
export const PBKDF2_ITERATIONS = 600_000;
export const CURRENT_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS;
export const MAX_PBKDF2_ITERATIONS = 2_000_000;
export const ENCRYPTION_VERSION = 2;
export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;
export const KEY_LENGTH = 256;
export const AES_GCM_ALGORITHM = "AES-GCM";

// Password & PIN Hashing
export const BCRYPT_ROUNDS = 12;
export const FAILED_VERIFY_MIN_DURATION_MS = 300;
export const MIN_MASTER_PASSWORD_LENGTH = 8;
export const MAX_MASTER_PASSWORD_LENGTH = 256;
export const MIN_SHARE_PASSWORD_LENGTH = 8;
export const MAX_SHARE_PASSWORD_LENGTH = 128;

// Credential Vault Lockout
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MINUTES = 15;

// Local App Lock / Key Wrap Storage Keys
export const APP_LOCK_PIN_HASH_KEY = "vaulty_app_lock_pin_hash";
export const APP_LOCK_WRAPPED_VAULT_KEY = "vaulty_vault_wrapped_key";
export const APP_LOCK_PASSKEY_STORAGE_KEY = "vaulty_app_lock_passkey_id";
export const APP_LOCK_INITIALIZED_KEY = "vaulty_app_lock_initialized";
export const APP_LOCK_ENABLED_KEY = "vaulty_app_lock_enabled";
export const APP_LOCK_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// CSRF & Session
export const CSRF_COOKIE_NAME = "csrf-token";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const CSRF_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MIN_SECRET_LENGTH = 32;

// Audit & Rate Limiting
export const MAX_IP_ADDRESS_LENGTH = 45;
export const MAX_USER_AGENT_LENGTH = 512;
export const SECURITY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const SECURITY_RATE_LIMIT_BLOCK_MS = 30 * 60 * 1000; // 30 minutes
export const FAMILY_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const FAMILY_RATE_LIMIT_MAX_REQUESTS = 30;

// Web Push
export const MAX_PUSH_ENDPOINT_LENGTH = 4000;

// File Upload & Storage
export const ALLOWED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const ALLOWED_EXTENSIONS: readonly string[] = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
export const MAX_EXTRACTED_TEXT_LENGTH = 2 * 1024 * 1024; // 2MB limit on extracted text
export const MAX_FOLDER_DEPTH = 50;

// AI & Gemini Processing
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
export const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL;
export const AI_WORKER_CONCURRENCY = 2;
export const AI_MIN_REQUEST_GAP_MS = 60_000;
export const AI_MAX_RETRIES = 5;
export const AI_RETRY_BASE_DELAY_MS = 3000;
export const AI_RETRY_MAX_DELAY_MS = 60_000;
export const AI_PROCESSING_TIMEOUT_MS = 180_000;
export const AI_WORKER_POLL_INTERVAL_MS = 5000;
export const AI_WORKER_BATCH_SIZE = 2;
export const AI_WORKER_BATCH_INTERVAL_MS = 10_000;

// Integrations & OAuth
export const GOOGLE_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"] as const;
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_CALLBACK_PATH = "/api/integrations/gmail/callback";
export const OUTLOOK_GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const OUTLOOK_TOKEN_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  "Mail.Read",
] as const;
export const OUTLOOK_CALLBACK_PATH = "/api/integrations/outlook/callback";
export const MAX_OUTLOOK_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_OUTLOOK_PDF_ATTACHMENTS = 5;

// PDF Personal Template Tokens
export const PDF_PERSONAL_FIELDS = [
  "firstName",
  "lastName",
  "mobile",
  "dateOfBirth",
  "pan",
] as const;
export const PDF_TEMPLATE_TOKENS = PDF_PERSONAL_FIELDS;

// Wealth & Currencies
export const DEFAULT_CURRENCY = "INR";
export const CURRENCY_OPTIONS = [
  { code: "INR", label: "INR (₹) - Indian Rupee" },
  { code: "USD", label: "USD ($) - US Dollar" },
  { code: "EUR", label: "EUR (€) - Euro" },
  { code: "GBP", label: "GBP (£) - British Pound" },
  { code: "AED", label: "AED (د.إ) - UAE Dirham" },
  { code: "CAD", label: "CAD ($) - Canadian Dollar" },
  { code: "AUD", label: "AUD ($) - Australian Dollar" },
  { code: "SGD", label: "SGD ($) - Singapore Dollar" },
] as const;

export const WEALTH_ACCOUNT_TYPES = [
  "SAVINGS",
  "CHECKING",
  "CREDIT_CARD",
  "INVESTMENT",
  "FIXED_DEPOSIT",
  "RECURRING_DEPOSIT",
  "PROVIDENT_FUND",
  "REAL_ESTATE",
  "GOLD",
  "CRYPTO",
  "LOAN",
  "INSURANCE",
  "OTHER",
] as const;

export const WEALTH_ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE", "CLOSED", "FROZEN"] as const;

export const WEALTH_TRANSACTION_TYPES = [
  "INCOME",
  "EXPENSE",
  "TRANSFER",
  "INVESTMENT_BUY",
  "INVESTMENT_SELL",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "TAX",
  "ADJUSTMENT",
] as const;

export const LIABILITY_ACCOUNT_TYPES: readonly string[] = ["CREDIT_CARD", "LOAN"];
export const MAX_STRING_LENGTH = 1000;
export const MAX_ARRAY_ITEMS = 100;

// Family
export const FAMILY_ROLES = ["ADMIN", "MEMBER"] as const;
export const FAMILY_MODULES = ["documents", "wealth", "credentials"] as const;
export const FAMILY_MODULE_LABELS = {
  documents: "Documents",
  wealth: "Wealth",
  credentials: "Credentials",
} as const;
export const FAMILY_MODULE_DESCRIPTIONS = {
  documents: "Shared folders and documents",
  wealth: "Accounts and net worth overview",
  credentials: "App and bank logins",
} as const;
export const FAMILY_INVITATION_TTL_DAYS = 7;
export const FAMILY_INVITATION_TTL_MS = FAMILY_INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

// Reminders
export const REMINDER_OFFSETS: readonly number[] = [30, 7, 1, 0];
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Common Regex Patterns
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

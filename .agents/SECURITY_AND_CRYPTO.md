# Vaulty — Security & Cryptography

This document details all cryptographic primitives, authentication defenses, rate limiting, and access-control invariants implemented in Vaulty.

---

## Zero-Knowledge Credential Vault (Client-Side Envelope Encryption)

Credential secrets in `AppCredential` and `BankCredential` are encrypted and decrypted strictly on the client using the Web Crypto API (`src/lib/envelope-crypto.ts`, `src/lib/web-crypto.ts`, `src/lib/constants.ts`).

### Primitives & Parameters

- **Key Derivation (KEK)**: `PBKDF2` (SHA-256) with `PBKDF2_ITERATIONS = 600_000` (`CURRENT_PBKDF2_ITERATIONS`), random 16-byte salt (`SALT_LENGTH = 16`).
- **Cipher (DEK + Wrapping)**: `AES-GCM` with 256-bit random Data Encryption Key (`KEY_LENGTH = 256`) per credential and random 12-byte IV (`IV_LENGTH = 12`).
- **Encrypted Storage**: `PasswordVault` stores `masterPasswordHash`, `encryptionSalt`, and `kdfIterations`; the plaintext master password and unencrypted DEKs never leave the browser.
- **Brute-Force Lockout**: `MAX_FAILED_ATTEMPTS = 5` locks vault unlock for `LOCK_DURATION_MINUTES = 15` (`failedAttempts`, `lockedUntil` on `PasswordVault`), backed additionally by PostgreSQL rate limiting.

### Offline Recovery & Key Re-Keying

- Implemented in `src/lib/key-recovery.ts` and `src/lib/key-recovery-verify.ts`.
- During setup (`/api/passwords/recovery/setup`), an offline recovery key derives a wrapping key to encrypt the vault KEK (`recoveryEncryptedKEK`, `recoverySalt`, `recoveryIv`, `recoveryKeyHash`, optional `recoveryQuestions`) while retaining an identifier (`recoveryKeyId`).
- If a user forgets their master password, `/api/passwords/recovery/verify` + `/api/passwords/recovery/rekey` verify recovery proof and re-wrap secrets client-side without server decryption.

### Cross-Device App Lock

- Implemented across `src/components/app-lock/`, `src/lib/use-vault-auto-unlock.ts`, `src/lib/key-wrap.ts`, and `/api/user/app-lock`.
- Users can enroll an App Lock PIN (`appLockPinHash`, `appLockWrappedKey` stored on `PasswordVault`), syncing wrapped key material across devices and enforcing auto-lock after `APP_LOCK_INACTIVITY_TIMEOUT_MS` (`5 * 60 * 1000` ms).

### Family Credential Key Sharing

- Implemented in `src/lib/family-crypto.ts` and `/api/family/credentials/key/**`.
- Each vault stores an asymmetric public key (`familyPublicKey`) and KEK-encrypted private key (`familyEncryptedPrivateKey`, `familyPrivateKeyIv`).
- Owners wrap vault access keys per `FamilyMembership` into `FamilyCredentialKey.wrappedKey` so authorized family members can decrypt shared credentials client-side.

---

## Local PDF Password Decryption

- Bank statements often arrive password-protected (e.g., first name + DOB / PAN combinations).
- Users configure reusable pattern rules in Settings (`PdfPasswordSettings`, `src/lib/pdf-passwords.ts`, `/api/settings/pdf-passwords`, optionally encrypted at rest with dedicated `PDF_PASSWORD_SETTINGS_SECRET`).
- Browser statement uploaders evaluate generated candidate passwords locally using `pdfjs-dist` before sending extracted content/plaintext to the server parser (`src/lib/statement-parser.ts`).

---

## CSRF Protection

- Implemented in `src/lib/csrf.ts`, `src/lib/csrf-client.ts`, and `src/proxy.ts`.
- Uses an HMAC-SHA256 signed double-submit cookie (`CSRF_COOKIE_NAME` paired with `CSRF_HEADER_NAME`) with a 1-hour TTL (`CSRF_TOKEN_TTL_MS`).
- `CSRF_SECRET` (>= 32 chars) is mandatory in production; `src/proxy.ts` issues the cookie on requests and cookie-authenticated mutation routes verify header-to-cookie equality and HMAC signature.

---

## Distributed PostgreSQL Rate Limiting

- Implemented in `src/lib/security-rate-limit.ts` (`consumeSecurityAttempt`, `clearSecurityAttempts`, `userRateLimitResponse`) backed by PostgreSQL `SecurityRateLimit`.
- Uses an atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` raw query with strict key format validation (`^[A-Za-z0-9:_-]{1,200}$`) — failing closed on invalid keys.
- Central presets live in `src/lib/rate-limits.ts` (`RATE_LIMITS`) and are overridable via `RATE_LIMIT_<SCOPE>_LIMIT` and `RATE_LIMIT_<SCOPE>_WINDOW_MS` env vars across search, document upload/AI/bulk, note images, statement parsing/import, user takeout, and password vault endpoints.

---

## Cron, Webhook & Admin Authentication

- **Cron endpoints** (`/api/cron/ai-worker`, `/api/cron/email-sync`, `/api/cron/reminders`): Verified against `CRON_SECRET` Bearer authorization.
- **Admin endpoints** (`/api/admin/ai-worker`, `/api/admin/cleanup-ai`): Require authenticated user email listed in `ADMIN_EMAILS` (`src/lib/admin-auth.ts`).
- **Webhooks**:
  - Google Drive channel webhook verifies `GOOGLE_DRIVE_WEBHOOK_SECRET`.
  - Resend inbound email webhook verifies Svix/Resend signatures via `RESEND_INBOUND_WEBHOOK_SECRET` (`src/lib/sync/resend-webhook-verifier.ts`).

---

## HTTP Security Headers & CSP (`next.config.ts`)

- **`Content-Security-Policy`**: Enforces `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` (in production), `worker-src 'self' blob: https://cdnjs.cloudflare.com` (PDF.js worker & PWA service worker), scoped `img-src`/`connect-src` for Google Drive thumbnails, avatars, and Vercel Analytics, plus `form-action 'self' https://accounts.google.com https://login.microsoftonline.com` for OAuth sign-in redirects.
- **`Permissions-Policy`**: Restricts `microphone=()` and `geolocation=()` while setting `camera=(self)` for first-party Camera Scan and 2FA QR Scanner modals.
- **Transport & Framing**: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `poweredByHeader: false`.

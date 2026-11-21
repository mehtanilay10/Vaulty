# Architecture, Integrations & Security

## 1. Runtime Topology & System Architecture

Vaulty is a private personal and family information workspace built on the Next.js App Router, PostgreSQL, Google Drive, and Google Gemini.

- **Web Application:** Next.js 16.4.5 App Router, React 19.3.1, TypeScript strict mode.
- **Authentication & Sessions:** Auth.js v5 beta with Prisma adapter, Google OAuth and email magic-link providers, JWT session strategy with 20-second in-memory session validation caching (`session-cache.ts`).
- **Database & Persistence:** PostgreSQL via Prisma 6.3.
- **File Storage:** Google Drive API using user-connected OAuth tokens. Google Drive is the only concrete storage provider.
- **AI Engine:** Google Gemini via `@google/genai` (`gemini-3.6-flash` default).
- **Email Delivery:** Resend SMTP via Nodemailer for authentication magic links, family invitations, and reminder emails.
- **Browser Push:** Web Push via `web-push` using VAPID keys and service worker (`public/sw.js`).
- **Styling:** Tailwind CSS v4, semantic CSS variables, Lucide icons, `next-themes`.
- **Background Workers:**
  - AI Document Queue: Persisted PostgreSQL queue with standalone worker (`yarn ai:worker`) or authenticated cron (`/api/cron/ai-worker`).
  - Email Transaction Sync: Mailbox crawler and transaction classifier with standalone daemon (`yarn worker:email`) or authenticated cron (`/api/cron/email-sync`).
  - Reminders & Expiries: Scheduled processor endpoint (`/api/cron/reminders`) triggered daily at 03:30 UTC via `vercel.json`.

```mermaid
flowchart TD
  Browser["Browser / PWA Client"] --> Next["Next.js App Router"]
  Next --> Auth["Auth.js (with 20s Session Cache)"]
  Next --> API["API Route Handlers"]
  API --> Domain["Domain Services (src/lib)"]
  Domain --> DB[("PostgreSQL / Prisma")]
  Domain --> Drive["Google Drive API"]
  Domain --> Gemini["Gemini API"]
  Domain --> Mail["Resend SMTP"]
  AIWorker["AI Worker Daemon / Cron"] --> DB
  AIWorker --> Drive
  AIWorker --> Gemini
  EmailWorker["Email Sync Worker / Cron"] --> DB
  EmailWorker --> Gemini
  Cron["Vercel Cron (03:30 UTC)"] --> ReminderCron["Reminder Cron Endpoint"]
  ReminderCron --> DB
  ReminderCron --> Mail
  ReminderCron --> WebPush["Web Push (VAPID)"]
```

---

## 2. Route Groups & App Shell Structure

- `/`: Public marketing and landing page.
- `src/app/(app)/layout.tsx`: Authenticated application shell wrapping all protected views with `AppLockProvider`, `PasswordVaultProvider`, `UploadProvider`, `AppShell`, `ErrorBoundary`, and `AppLockScreen` (`force-dynamic`).
- `src/app/layout.tsx`: Root wrapper containing `ThemeProvider`, `SessionProvider`, `FeedbackProvider`, and global `SiteFooter`.
- `/auth/*`: Sign-in, verification request, and error pages (`/auth/signin`, `/auth/verify-request`, `/auth/error`).
- `/share/[token]`: Public document share route; validates share tokens, passwords, expiration, and maximum view counts with signed session cookies.
- `/api/passwords/recovery/verify` & `/api/passwords/recovery/rekey`: Token-gated recovery endpoints authorized via one-time reset tokens (or active sessions), exempted from standard session redirection in `proxy.ts`.
- `src/proxy.ts`: Middleware boundary enforcing session authentication for protected paths, validating session version (defaulting unversioned legacy tokens to 0 so revocations invalidate them), and setting double-submit CSRF cookies.

---

## 3. External Integrations

### Google OAuth & Google Drive Storage

- Configured in `src/auth.ts`, `src/lib/google-drive/oauth.ts`, and `src/lib/storage/drive-provider.ts`.
- Uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Scopes: `openid`, `email`, `profile`, `drive.file`, and `drive.readonly`.
- Original document binaries and generated AI artifacts live in the user's Google Drive under a structured hierarchy:
  `Vaulty/Docs`, `Vaulty/Summary`, `Vaulty/Interpretation`, `Vaulty/Text`.
- Drive OAuth refresh tokens are encrypted at rest with AES-256-GCM using a key purpose-derived from `AUTH_SECRET`.
- Sync logic in `src/lib/sync/sync-engine.ts` tracks Drive file/folder metadata, records sync events, and reconciles conflicts.

### Google Gemini AI

- SDK: `@google/genai` with `GEMINI_API_KEY` and model `GEMINI_MODEL` (defaults to `gemini-3.6-flash`).
- Used for document extraction, Markdown summaries, informational interpretations, structured date extraction, grounded chat (`/api/chat`), and financial email transaction classification.
- Document prompts strictly forbid fabricated facts and mandate explicit uncertainty disclaimers. Medical interpretations are informational only (no medical diagnoses or prescription changes).
- **Data Boundary:** Credential vault plaintext is never transmitted to Gemini. Only uploaded document contents and email text payloads are sent to Gemini.

### Email (Resend SMTP & Inbound Webhooks)

- Uses `RESEND_API_KEY`, `RESEND_INBOUND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN`, and `EMAIL_FROM`.
- Auth.js email magic links use `smtp.resend.com` (port 465, secure).
- `src/lib/email.ts` dispatches application emails, family invitations, and daily reminder digests.
- **Inbound Webhook (`/api/webhooks/resend/inbound`):** Receives forwarded emails via Svix-signed webhooks, resolves recipient addresses (`username+docs@vaulty.mnilay.com`), automatically cracks password-protected statement PDFs via `PdfPasswordSettings`, stages binary attachments in `InboundEmailAttachment`, and runs multi-module classification for documents, reminders, and wealth transactions without mailbox OAuth grants.

### Financial Email Discovery (Gmail & Outlook)

- **Gmail:** Uses incremental delegated `gmail.readonly` scope. Disconnecting local tokens deletes local encrypted credentials without revoking the shared Google OAuth project grant.
- **Outlook:** Dedicated Microsoft Entra application (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID="consumers"`). Uses delegated `Mail.Read`, `User.Read`, and `offline_access`.
- **Sync Engine:** `src/lib/sync/email-sync-engine.ts` processes messages in batches of 15, filters personal/promotional emails, auto-imports high-confidence ($\ge 0.90$) transactions into matched Wealth accounts, and queues ambiguous items for manual review.
- Refresh tokens for both providers are encrypted at rest with AES-256-GCM using keys derived from `AUTH_SECRET`.

### Browser Push Notifications (Web Push)

- Implemented with `web-push` in `src/lib/web-push.ts`.
- Uses `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`.
- Client registers `public/sw.js` and persists subscription endpoints via `/api/push/subscription`. Subscription public keys (`p256dh`) and auth secrets (`auth`) are encrypted at rest using keys derived from `AUTH_SECRET`.
- Delivery failures with 404/410 status codes automatically prune expired subscriptions.

---

## 4. Security & Cryptography Model

### Authentication & Session Lifecycle

- Auth.js v5 beta JWT session strategy.
- Tokens contain `userId` and `sessionVersion`. Session invalidation (`/api/user/sessions/revoke`) increments `User.sessionVersion` in PostgreSQL, immediately rejecting revoked tokens.
- **Session Cache:** Protected requests validate session version with a 20-second in-memory cache (`session-cache.ts`), eliminating redundant remote database queries on rapid navigations.
- **Development Login:** `/api/dev-login` is strictly guarded and returns 404/unauthorized outside `NODE_ENV === "development"`.

### Client-Side Credential Vault Encryption

- Passwords and bank credentials are encrypted client-side using Web Crypto.
- **Version 2 Envelope Encryption:**
  - Data Encryption Key (DEK): Random 256-bit AES-GCM key per credential record.
  - Key Encryption Key (KEK): Master-password-derived key using PBKDF2-HMAC-SHA256 with 600,000 iterations.
  - Payload ciphertext, IV, auth tag, and KEK-wrapped DEK are stored as version 2 envelopes (`v2:...`).
- Plaintext credentials and master passwords are never sent to or stored on the server.
- The server stores only the user's master password verifier (bcrypt) and KDF salt/parameters.
- Unlocked key material is held in browser memory by `PasswordVaultProvider`; closing the session or locking the vault clears the in-memory key immediately.
- **Brute-Force Lockout Defense:**
  - Both `/api/passwords/unlock` and `/api/passwords/change-master-password` track failed attempts and lock out for 15 minutes after 5 consecutive failures.
- **Input Bounds:**
  - Credential fields enforce strict character caps via Zod (e.g. envelope ciphertext maximum 100,000 characters).
- **Buffer Safety:**
  - Web Crypto key wrapping (`src/lib/key-wrap.ts`) encodes buffers using chunked byte iteration to prevent call stack overflow on large arrays.

### App Lock & Cross-Device PIN Convenience

- Centralized 4-digit PIN / WebAuthn passkey lock at the application layout.
- **Cross-Device PIN Sync:** When a user sets up a 4-digit PIN, its SHA-256 hash (`appLockPinHash`) and an AES-GCM wrapped vault convenience key (`appLockWrappedKey`) are saved to `PasswordVault` via `/api/user/app-lock`. This enables the same PIN to unlock App Lock and transparently unwrap credentials across mobile and desktop devices.
- **Inactivity Grace Period:** App Lock stores an activity timestamp in `sessionStorage` (`LAST_ACTIVE_KEY`) with a 5-minute inactivity timeout. Hard page reloads and brief tab switching preserve unlocked state without prompting for the PIN repeatedly.
- WebAuthn operations are client-side convenience challenges; they do not replace server-side authentication.

### Zero-Knowledge Populated Vault Recovery Re-Keying

- When users configure recovery, the browser generates an offline recovery key and hashes security question answers.
- If a user forgets their master password:
  - An empty vault can be reset directly.
  - A populated vault requires the offline recovery key and security answers via `/api/passwords/recovery/rekey`. The browser unwraps the KEK, decrypts existing credentials in memory, re-encrypts them with a new master-password-derived KEK, and commits them atomically.
  - Recovery routes (`/api/passwords/recovery/verify`, `/api/passwords/recovery/rekey`) authorize via the emailed reset token, allowing recovery without an active Auth.js session cookie.
  - If recovery is unconfigured, password reset is blocked to prevent catastrophic data loss.

### Financial PDF Statement Decryption

- Financial email sync downloads statement PDFs only from statement-like messages (max 5 PDFs per message).
- `PdfPasswordSettings` stores user-configured personal values and institution password templates in an AES-256-GCM encrypted blob using `PDF_PASSWORD_SETTINGS_SECRET` (or `AUTH_SECRET`).
- `src/lib/sync/email-statement-attachments.ts` decrypts and parses text locally with `pdfjs-dist`. PDF bytes, personal password values, and decrypted statement text are never sent to Gemini or logged.

### Request Protections & Security Controls

- **Production Secret Enforcement:**
  - `src/env.ts` enforces that in production (`NODE_ENV === "production"`), `AUTH_SECRET`, `CRON_SECRET`, and `CSRF_SECRET` must all be configured with at least 32 characters.
- **CSRF Defense:** Double-submit cookie with HMAC-SHA256 signature (`csrf-token` and `x-csrf-token`). Production requires a dedicated random `CSRF_SECRET` (minimum 32 characters) and never falls back to `AUTH_SECRET`.
- **Distributed Rate Limiting:** PostgreSQL-backed sliding window rate limiter (`SecurityRateLimit` via `consumeSecurityAttempt`) protects authentication, dev-login, PIN verification, share link access, recovery, user search, and family sharing endpoints across serverless instances, returning `Retry-After` headers on 429.
- **Cron Authorization:** All `/api/cron/*` endpoints require `Authorization: Bearer <CRON_SECRET>` (minimum 32 characters) with timing-safe string comparison.
- **Account Takeout & Deletion:**
  - Settings provides complete account takeout streaming a client-side ZIP containing documents, transactions, and encrypted credential envelopes. Enforces memory-safe caps: max 50 files, 50 MiB per file, and a 200 MiB cumulative budget.
  - Transactional account deletion wipes all database records across 20+ tables (including rate limits and verification tokens), Google Drive folders, and OAuth grants.
- **Public Share Links:**
  - Cryptographic token generation uses unbiased `crypto.randomInt`.
  - Share password verification enforces a 128 MiB memory limit (`maxmem: 128 * 1024 * 1024`) on scrypt to prevent Node process termination.
  - View counts decrement only after file bytes are successfully fetched from Google Drive.
- **HTTP Security Headers:** Next.js configuration enforces HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and restrictive `Permissions-Policy`.

---

## 5. Known Limitations

- Google Drive is the only implemented storage provider.
- End-to-end encryption applies to credential vault records and PDF password settings; uploaded document files and database metadata are encrypted at rest by Google Drive and PostgreSQL/Neon, not end-to-end client-encrypted.
- WebAuthn passkey unlock is a device-local convenience layer, not server-authenticated WebAuthn sign-in.
- Financial statement PDF parsing requires digital text; scanned or image-only statements are not OCRed by the email attachment engine.
- AI date extraction is assistive: only explicitly printed dates are extracted with high confidence ($\ge 0.85$); users should review all extracted financial deadlines.

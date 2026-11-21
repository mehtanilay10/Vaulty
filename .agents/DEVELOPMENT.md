# Development, Testing & Operations

## 1. Prerequisites & Quick Start

- **Node.js:** Node.js version supported by Next.js 16.4.5.
- **Package Manager:** Corepack with Yarn 4.5.3 (`packageManager` in `package.json`).
- **Database:** PostgreSQL instance (local or Neon serverless) via `DATABASE_URL`.
- **Integrations:** Google Cloud Console OAuth credentials, Gemini API key, Resend API key.

```bash
# Enable Corepack and install dependencies
corepack enable
yarn install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma Client and apply migrations
yarn prisma generate
yarn db:migrate

# Start local Next.js development server
yarn dev
```

The application runs at `http://localhost:3000`.

---

## 2. Environment Variables Reference

| Variable                        | Required |      Context / Default      | Purpose                                                                         |
| :------------------------------ | :------: | :-------------------------: | :------------------------------------------------------------------------------ |
| `DATABASE_URL`                  | **Yes**  |             All             | PostgreSQL connection string                                                    |
| `AUTH_SECRET`                   | **Yes**  |             All             | Auth.js signing secret (32+ chars in prod); derives refresh token and push keys |
| `NEXTAUTH_URL`                  | **Yes**  |             All             | Canonical app URL for OAuth callbacks                                           |
| `GOOGLE_CLIENT_ID`              | **Yes**  |             All             | Google OAuth client ID (sign-in, Drive, Gmail)                                  |
| `GOOGLE_CLIENT_SECRET`          | **Yes**  |             All             | Google OAuth client secret                                                      |
| `GEMINI_API_KEY`                | **Yes**  |           For AI            | Google Gemini API key                                                           |
| `GEMINI_MODEL`                  |    No    |     `gemini-3.6-flash`      | Gemini model name                                                               |
| `RESEND_API_KEY`                |    No    |          For Email          | Resend SMTP / API key for notifications and magic links                         |
| `EMAIL_FROM`                    |    No    |    `noreply@vaulty.app`     | Sender email address                                                            |
| `CRON_SECRET`                   |    No    |    For Cron (32+ chars)     | Bearer secret protecting `/api/cron/*` endpoints (32+ chars in prod)            |
| `CSRF_SECRET`                   | **Prod** |          32+ chars          | Dedicated HMAC-SHA256 double-submit cookie secret                               |
| `RESEND_INBOUND_WEBHOOK_SECRET` |    No    |       Forwarding only       | Svix webhook signing secret from Resend Inbound                                 |
| `INBOUND_EMAIL_DOMAIN`          |    No    |       Forwarding only       | Domain for inbound routing (e.g. `vaulty.mnilay.com`)                           |
| `PDF_PASSWORD_SETTINGS_SECRET`  |    No    | Falls back to `AUTH_SECRET` | AES-256-GCM encryption key for PDF password settings                            |
| `DEV_LOGIN_EMAIL`               | Dev only |        `.env.local`         | Quick dev-login email for local testing                                         |
| `FAST_BUILD`                    |    No    |           `false`           | Set `true` to skip duplicate type-checks during `next build`                    |
| `MICROSOFT_CLIENT_ID`           |    No    |        Outlook only         | Microsoft Entra app client ID                                                   |
| `MICROSOFT_CLIENT_SECRET`       |    No    |        Outlook only         | Microsoft Entra app client secret value                                         |
| `MICROSOFT_TENANT_ID`           |    No    |         `consumers`         | Microsoft Entra tenant                                                          |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  |    No    |          Web Push           | Public P-256 VAPID key                                                          |
| `VAPID_PRIVATE_KEY`             |    No    |          Web Push           | Server-only P-256 VAPID private key                                             |
| `WEB_PUSH_SUBJECT`              |    No    |          Web Push           | VAPID contact mailto or HTTPS URI                                               |
| `EMAIL_WORKER_POLL_INTERVAL_MS` |    No    |      `300000` (5 min)       | Background email sync worker polling interval                                   |

---

## 3. Available NPM Scripts

| Command                       | Purpose                                                                         |
| :---------------------------- | :------------------------------------------------------------------------------ |
| `yarn dev`                    | Start Next.js development server on `localhost:3000`                            |
| `yarn build`                  | Run `prisma generate` and `next build`                                          |
| `yarn build:fast`             | Fast production build with `FAST_BUILD=true` (~5s)                              |
| `yarn start`                  | Run production Next.js server                                                   |
| `yarn lint` / `yarn lint:fix` | Run ESLint checks / auto-fix                                                    |
| `yarn type-check`             | Run `tsc --noEmit` across the repository                                        |
| `yarn test`                   | Run all 31 Vitest test suites (238 tests)                                       |
| `yarn test:watch`             | Run Vitest in watch mode                                                        |
| `yarn test:e2e`               | Run Playwright Chromium end-to-end tests                                        |
| `yarn test:e2e:ui`            | Run Playwright test runner UI                                                   |
| `yarn playwright:install`     | Install Playwright Chromium browser and OS dependencies                         |
| `yarn ai:worker`              | Start standalone background AI document processing daemon                       |
| `yarn worker:email`           | Start standalone background email transaction sync daemon                       |
| `yarn db:migrate`             | Apply Prisma migrations in development (`prisma migrate dev`)                   |
| `yarn db:push`                | Prototype schema changes without migration (`prisma db push`)                   |
| `yarn db:studio`              | Open interactive database UI (`prisma studio`)                                  |
| `yarn vercel-build`           | Automated deployment script (`prisma generate && migrate deploy && next build`) |

---

## 4. Background Workers & Production Cron

1. **Reminders & Expiries Processor:**
   - **Endpoint:** `GET /api/cron/reminders` with `Authorization: Bearer <CRON_SECRET>`.
   - **Schedule:** Configured in `vercel.json` daily at `03:30 UTC` (`09:00 IST`). Evaluates document expiries, wealth account expiries, credit-card payment due days, and custom reminders.
2. **AI Document Processing Queue:**
   - **Standalone Daemon:** `yarn ai:worker` (`src/workers/ai-worker.ts`).
   - **Cron Alternative:** `GET` or `POST /api/cron/ai-worker` with `Authorization: Bearer <CRON_SECRET>`.
3. **Email Multi-Module Discovery Sync:**
   - **Standalone Daemon:** `yarn worker:email` (`src/workers/email-worker.ts`).
   - **Scheduled GitHub Actions Cron:** `.github/workflows/email-sync-cron.yml` (triggers every 15 minutes).
   - **Cron Alternative:** `GET` or `POST /api/cron/email-sync` with `Authorization: Bearer <CRON_SECRET>`.

---

## 5. Testing & Quality Assurance

### Automated Test Suites

Run `yarn test` to execute all 31 checked-in test suites covering 238 unit and integration tests:

| Test File                                              | Focus Area                                                                                        |
| :----------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `src/app/api/documents/[id]/append-page/route.test.ts` | Multi-page append, PDF conversion/stitching, and AI job queue triggering                          |
| `src/app/api/notifications/route.test.ts`              | In-app notification center feed, read updates, and CSRF protection                                |
| `src/app/api/webhooks/resend/inbound/route.test.ts`    | Resend Inbound webhook dispatch and Svix signature verification                                   |
| `src/lib/authz.test.ts`                                | Document and folder authorization, direct shares, ancestor hierarchy                              |
| `src/lib/core-utils.test.ts`                           | Date math, share password crypto, and core formatting                                             |
| `src/lib/csrf.test.ts`                                 | Double-submit CSRF HMAC-SHA256 signatures, production secret enforcement                          |
| `src/lib/envelope-crypto.test.ts`                      | Version 2 AES-256-GCM envelope encryption and PBKDF2 KEK derivation                               |
| `src/lib/family-access.test.ts`                        | Module-level access gates (`shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`) |
| `src/lib/family-service.test.ts`                       | Family invitation, acceptance, update, and revocation lifecycles                                  |
| `src/lib/family.test.ts`                               | Family helper utilities and membership verification                                               |
| `src/lib/gemini.test.ts`                               | Gemini response parsing, structured date extraction, cooldown management                          |
| `src/lib/key-recovery.test.ts`                         | Zero-knowledge recovery KEK unwrap/re-wrap and security answer hashing                            |
| `src/lib/key-wrap.test.ts`                             | AES-KW CryptoKey wrapping and unwrapping with secret                                              |
| `src/lib/pdf-passwords.test.ts`                        | Password template expansion, token validation, candidate ordering                                 |
| `src/lib/statement-parser.test.ts`                     | Bank statement date/currency extraction (INR, DD/MM/YYYY, named months)                           |
| `src/lib/wealth.test.ts`                               | Running balances, balance delta calculations, strict currency separation                          |
| `src/lib/web-push.test.ts`                             | Web Push VAPID contract, endpoint validation, subscription key encryption                         |
| `src/lib/gmail/account-matching.test.ts`               | Last-four hint extraction and unique-only account matching                                        |
| `src/lib/gmail/classify-transaction-emails.test.ts`    | Relevance ranking, marketing email filtering, 30-message batching                                 |
| `src/lib/gmail/dedupe-transactions.test.ts`            | Candidate deduplication against pending reviews and saved transactions                            |
| `src/lib/gmail/parse-transaction-email.test.ts`        | Message body parsing heuristics                                                                   |
| `src/lib/google-drive/oauth.test.ts`                   | Drive token refresh and AES-256-GCM encryption                                                    |
| `src/lib/outlook/oauth.test.ts`                        | Graph message normalization and token encryption                                                  |
| `src/lib/scanner/pdf-stitcher.test.ts`                 | Client-side multi-page PDF stitching and ordering (`pdf-lib`)                                     |
| `src/lib/scanner/perspective.test.ts`                  | 4-corner perspective transform, Heckbert projection matrix, aspect ratios                         |
| `src/lib/sync/classify-multi-module-emails.test.ts`    | Multi-module ranking, document/reminder heuristics, and spam penalty scoring                      |
| `src/lib/sync/dedupe-email-items.test.ts`              | Candidate deduplication across documents, reminders, and transactions                             |
| `src/lib/sync/email-sync-engine.test.ts`               | Complete sync pipeline, auto-import ($\ge 0.90$), and review queue staging                        |
| `src/lib/sync/inbound-email-service.test.ts`           | Inbound email attachment staging, PDF cracking, and multi-module dispatch                         |
| `src/lib/sync/resend-webhook-verifier.test.ts`         | Svix cryptographic webhook signature verification                                                 |
| `src/types/family.test.ts`                             | Family module type guards and shape validations                                                   |

### Manual Verification Checklist

- **Dev Login:** Quick sign-in button on `/auth/signin` works in development with `mehtanilay123@gmail.com`.
- **App Lock:** Unlock using PIN `1248`. Confirm that hard page reloads and tab switching do not prompt again within 5 minutes.
- **Document Library:** `/documents/library` displays owned documents, matching the count on `/dashboard`.
- **Hover Actions:** Document list rows show hover actions (Download, View Details) without nested anchor conflicts.
- **Wealth Account Details:** Adding or editing transactions immediately updates the transaction list and running balances without manual refresh.
- **Button Hierarchy:** Confirm single solid primary CTA on `/wealth` ("Add account") and secondary styling on "Import statement".
- **Reminders Segmented Control:** Switching between `[ List | Calendar ]` transitions smoothly between `/reminders` and `/reminders/calendar-view`.
- **Notifications:** Notifications cards are keyboard accessible (Enter/Space opens action link), dates render without hydration mismatch, and bell displays a skeleton loader while fetching.

---

## 6. Troubleshooting Guide

### Build & TypeScript Issues

- **`tsc --noEmit` fails:** Run `yarn type-check` to view root diagnostics.
- **Duplicate build type-checking:** Use `yarn build:fast` (`FAST_BUILD=true`) to compile Next.js production bundles rapidly.

### Authentication & OAuth

- **Invalid redirect URI:** Verify Google Cloud Console has exact URIs:
  - `/api/auth/callback/google`
  - `/api/integrations/google-drive/callback`
  - `/api/integrations/gmail/callback`
- **Microsoft Entra:** Verify redirect `/api/integrations/outlook/callback` and use the client secret **value**, not secret ID.
- **Session invalidation:** If users remain logged in after password changes, verify `/api/user/sessions/revoke` increments `sessionVersion`. Note that the 20-second in-memory session cache clears immediately upon revocation.

### Database & Search Latency

- **Slow search queries:** Ensure all search queries in `/api/search` and `/api/search/omni` avoid $N+1$ database loops and evaluate permissions in memory across fetched candidates.
- **Prisma migrations:** If a migration fails in production, do NOT run `migrate reset`. Inspect `_prisma_migrations` and apply SQL changes with `prisma migrate deploy`.

### Google Drive & Storage

- **Disconnection banner:** If Google Drive connection expires, reconnect via Settings. The app preserves existing refresh tokens if Google does not return a new one on reconnect.
- **File deletion in Drive:** External deletions update `DocumentStorageStatus` to `DELETED_EXTERNALLY` upon sync reconciliation.

### Email Sync & PDF Statement Decryption

- **Attachment fails to decrypt:** Check Settings → Security → Financial PDF password templates. Ensure `{{firstName}}`, `{{lastName}}`, `{{pan}}`, or `{{dateOfBirth}}` are set and match bank formats.
- **Scanned statements:** Scanned/image-only PDFs are not OCRed by `pdfjs-dist`; import these manually via the Statement Import wizard.

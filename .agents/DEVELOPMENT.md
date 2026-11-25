# Development, Testing & Operations

## 1. Prerequisites & Quick Start

- **Node.js:** Node.js version supported by Next.js 16.4.5 (v20+ recommended).
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
| `RESEND_API_KEY`                |    No    |          For Email          | Resend API key for notifications, magic links, and invitations                  |
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
| `yarn test`                   | Run all 36 Vitest test suites (273 tests)                                       |
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

Run `yarn test` to execute all 36 checked-in test suites covering 273 unit and integration tests:

| Test File                                              | Focus Area                                                                                        |
| :----------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `src/app/api/documents/[id]/append-page/route.test.ts` | Multi-page append, PDF conversion/stitching, and AI job queue triggering                          |
| `src/app/api/notifications/route.test.ts`              | In-app notification center feed, read updates, and CSRF protection                                |
| `src/app/api/notes/route.test.ts`                      | Note creation, search querying, pinned ordering, and input validation                             |
| `src/app/api/notes/[id]/route.test.ts`                 | Note updates, archiving, color styling, and ownership gates                                       |
| `src/app/api/notes/[id]/images/route.test.ts`          | Note image uploads, attachment validation, and image deletions                                    |
| `src/app/api/family/notes/route.test.ts`               | Family note sharing permissions and read-only isolation                                           |
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
| `src/lib/key-wrap.test.ts`                             | AES-KW CryptoKey wrapping and unwrapping with secret and PIN hashes                               |
| `src/lib/pdf-passwords.test.ts`                        | Password template expansion, token validation, candidate ordering                                 |
| `src/lib/statement-parser.test.ts`                     | Bank statement date/currency extraction (INR, DD/MM/YYYY, named months)                           |
| `src/lib/totp.test.ts`                                 | RFC 6238 TOTP computation, Base32 secret decoding, window validation                              |
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

---

## 6. Manual Verification Checklist

Before releasing or committing changes across core flows:

1. **Document Upload & Mobile Camera Scan:**
   - Upload PDF and JPEG files via `/documents` or navbar action.
   - Test camera scanner modal: crop perspective points, apply B&W filter, add pages, and stitch PDF.
   - Verify document lands in Google Drive (`Vaulty/Docs`) and displays in `/documents/library`.
2. **Hierarchical Folder Navigation:**
   - Create nested folders (e.g. `Medical/Blood Tests`).
   - Use `FolderTreeSelect` dropdown to verify depth indentation, expand/collapse, quick search, and path display.
3. **Notes Tri-Mode Canvas:**
   - Test formatting toolbar buttons in Rich Text mode.
   - Add to-dos and verify checkboxes align on the same flex line as text.
   - Toggle to Markdown and Preview tabs; verify pasted images render without errors.
4. **Credential Vault & App Lock:**
   - Unlock with master password; verify TOTP codes countdown properly.
   - Test PIN setup and App Lock unlock.
5. **Wealth Ledger & Statement Import:**
   - Add wealth account and transaction; verify running balance recalculates.
   - Upload sample statement PDF or CSV.
6. **Email Sync:**
   - Trigger sync at `/email-sync` and inspect staging queues.

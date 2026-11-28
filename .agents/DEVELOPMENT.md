# Vaulty — Development & Operations Guide

---

## Prerequisites

- **Node.js** & **Yarn `4.5.3`** (Corepack / repo-local Yarn)
- **PostgreSQL** (local or Neon/cloud Postgres matching `DATABASE_URL`)
- Google Cloud OAuth credentials (Sign-In + Google Drive API), Resend API key (Magic Links & Inbound webhook), and Gemini API key(s)

---

## Environment Variables (`.env.example`)

Copy `.env.example` to `.env.local` or `.env`:

| Group                      | Variables                                                                                                                                                                      |
| :------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database**               | `DATABASE_URL`                                                                                                                                                                 |
| **Auth & Security**        | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `CSRF_SECRET` (>= 32 chars in production), `NEXTAUTH_URL`, `PDF_PASSWORD_SETTINGS_SECRET` (optional key separation) |
| **Email (Resend)**         | `RESEND_API_KEY`, `RESEND_INBOUND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN`, `EMAIL_FROM`                                                                                        |
| **Gemini AI**              | `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` (multi-key rotation), `GEMINI_MODEL` (`gemini-3.5-flash-lite`), `GEMINI_FALLBACK_MODEL` (`gemini-3.1-flash-lite`)   |
| **Upload & Rate Limits**   | `MAX_UPLOAD_SIZE` (`52428800`), optional per-scope `RATE_LIMIT_<SCOPE>_LIMIT` / `RATE_LIMIT_<SCOPE>_WINDOW_MS`                                                                 |
| **Microsoft Outlook**      | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` (`consumers`)                                                                                          |
| **Web Push (VAPID)**       | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`                                                                                                        |
| **Webhooks, Cron & Admin** | `CRON_SECRET`, `GOOGLE_DRIVE_WEBHOOK_SECRET`, `ADMIN_EMAILS`, `DEV_LOGIN_EMAIL` (dev only)                                                                                     |
| **Background Workers**     | `AI_WORKER_BATCH_SIZE`, `AI_WORKER_BATCH_INTERVAL_MS`, `AI_WORKER_ID`, `EMAIL_WORKER_POLL_INTERVAL_MS`                                                                         |

---

## NPM / Yarn Scripts (`package.json`)

| Script                               | Command                                                                                          | Purpose                                               |
| :----------------------------------- | :----------------------------------------------------------------------------------------------- | :---------------------------------------------------- |
| `yarn dev`                           | `next dev`                                                                                       | Start local development server                        |
| `yarn build`                         | `prisma generate && cross-env NODE_OPTIONS=--max-old-space-size=4096 next build`                 | Full Prisma generate + production build               |
| `yarn build:fast`                    | `prisma generate && cross-env FAST_BUILD=true NODE_OPTIONS=--max-old-space-size=4096 next build` | Skip heavy checks where configured (`next.config.ts`) |
| `yarn start`                         | `next start`                                                                                     | Run built Next.js server                              |
| `yarn type-check`                    | `cross-env NODE_OPTIONS=--max-old-space-size=4096 tsc --noEmit`                                  | Run strict TypeScript check                           |
| `yarn lint` / `yarn lint:fix`        | `eslint .` / `eslint . --fix`                                                                    | Run ESLint                                            |
| `yarn prettier:fix`                  | `prettier --write .`                                                                             | Format repository files                               |
| `yarn test` / `yarn test:watch`      | `vitest run` / `vitest`                                                                          | Run Vitest unit test suites (36 suites)               |
| `yarn test:e2e` / `yarn test:e2e:ui` | `playwright test`                                                                                | Run Playwright browser E2E tests                      |
| `yarn playwright:install`            | `playwright install --with-deps chromium`                                                        | Install Chromium binary for Playwright                |
| `yarn db:generate`                   | `prisma generate`                                                                                | Regenerate Prisma Client                              |
| `yarn db:migrate`                    | `prisma migrate dev`                                                                             | Create & apply local SQL migrations                   |
| `yarn db:push`                       | `prisma db push`                                                                                 | Sync dev schema without migration                     |
| `yarn db:studio`                     | `prisma studio`                                                                                  | Open Prisma database explorer                         |
| `yarn db:seed`                       | `tsx prisma/seed.ts`                                                                             | Seed initial development data                         |
| `yarn ai:worker`                     | `tsx src/workers/ai-worker.ts`                                                                   | Run standalone Gemini AI worker loop                  |
| `yarn worker:email`                  | `tsx src/workers/email-worker.ts`                                                                | Run standalone Gmail/Outlook sync worker              |
| `yarn emails:*`                      | `download`, `identify-senders`, `process`, `reset`                                               | Local email pipeline helper scripts under `scripts/`  |

---

## Cron & CI Workflows

- **`vercel.json`**: Runs `/api/cron/reminders` daily at `30 3 * * *`.
- **`.github/workflows/`**:
  - `ci.yml` — Lint, type-check, and Vitest verification
  - `playwright.yml` — End-to-end Playwright suite
  - `codeql.yml` — Static security analysis
  - `ai-worker-cron.yml` & `email-sync-cron.yml` — Scheduled triggers calling protected cron endpoints

---

## Troubleshooting

- **Windows `EPERM` during `prisma generate`**: If another Node/Vitest process holds a lock on `node_modules/.prisma/client/query_engine-windows.dll.node`, close background Node processes or run `next build` directly (`yarn cross-env FAST_BUILD=true NODE_OPTIONS=--max-old-space-size=4096 next build`) when `prisma/schema.prisma` hasn't changed.
- **CSRF errors in browser mutations**: Ensure client fetches use `csrfFetch` (`src/lib/csrf-client.ts`) and `CSRF_SECRET` is configured cleanly (`>= 32` characters).

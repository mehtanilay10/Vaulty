# Vaulty — System Architecture

---

## High-Level Runtime Topology

Vaulty is a full-stack Next.js `16.4.5` App Router application (`React 19.3.1`, TypeScript) deployed with PostgreSQL (`@prisma/client` `6.3`) and integrated external providers:

- **Web Tier & RSC/API**: Next.js App Router serves server-rendered layouts, Server Components, and REST route handlers (`src/app/api/**`), plus standalone landing/auth/share routes.
- **Request Gate (`src/proxy.ts`)**: Runs on matched paths (excluding `_next/static`, `_next/image`, `_vercel`, `favicon.ico`, `manifest.json`, `icons`, and static asset extensions) to validate authenticated sessions and issue double-submit CSRF cookies.
- **Database**: PostgreSQL holds user identities, sessions, folder trees, document indexes, wealth accounts/transactions, ciphertexts, staging queues, rate limits (`SecurityRateLimit`), and AI jobs (`AiJob`).
- **File Storage**: User documents live in the user's connected Google Drive (`StorageConnection`, `src/lib/storage/drive-provider.ts`); Vaulty acts as an indexed, AI-enriched layer rather than holding opaque raw document blobs permanently. (Exception: temporary `InboundEmailAttachment` bytes staged from inbound email webhooks until imported.)
- **Analytics**: `@vercel/analytics` (`<Analytics />` from `@vercel/analytics/next` rendered in `src/app/layout.tsx`, with `_vercel/*` allowed past `src/proxy.ts`).

---

## Authentication & Session Integrity

- **Providers**: Auth.js (`next-auth@^5.0.0-beta.32`) configured with Google OAuth and Email Magic Links (Resend). In local `NODE_ENV=development`, `/api/dev-login` provides a gated dev bypass for `DEV_LOGIN_EMAIL`.
- **Session Revocation (`sessionVersion`)**: Every `User` row carries an incrementing `sessionVersion`. `src/proxy.ts` calls `validateSessionVersion` (`src/lib/session-validation.ts`) so invoking `POST /api/user/sessions/revoke` invalidates active sessions across devices immediately.

---

## AI Pipeline & Background Workers

- **Gemini Integration (`src/lib/gemini.ts`)**: Uses `@google/genai` with multi-key rotation (`GEMINI_API_KEY_1`..`N`, 30s cooldown tracking on rate limits) and model fallback (`DEFAULT_GEMINI_MODEL` -> `DEFAULT_GEMINI_FALLBACK_MODEL`).
- **Queue & Execution**:
  - Inline document AI (`POST /api/documents/[id]/ai`) and batch queueing (`POST /api/documents/ai/batch`).
  - Asynchronous job queue (`AiJob`, `AiProcessing`) processed via `src/lib/ai/worker.ts` and callable from:
    - Standalone loop worker: `src/workers/ai-worker.ts` (`yarn ai:worker`)
    - Protected cron/admin endpoints: `/api/cron/ai-worker`, `/api/admin/ai-worker`, `/api/admin/cleanup-ai`
    - GitHub Actions schedule (`.github/workflows/ai-worker-cron.yml`).

---

## Email & Notification Pipelines

1. **Scheduled Reminders**:
   - Vercel Cron (`vercel.json`: `"30 3 * * *"` calling `/api/cron/reminders`) executes `src/lib/reminder-worker.ts`.
   - Evaluates active reminders against `notifyDaysBefore`, creates deduplicated `Notification` rows (`idempotencyKey`), dispatches transactional emails (`RESEND_API_KEY`, `src/lib/email.ts`), and sends Web Push alerts (`src/lib/web-push.ts` via VAPID keys + `PushSubscription`).
2. **Email Auto-Sync**:
   - Polls Gmail (`src/lib/gmail/`) and Outlook (`src/lib/outlook/`) via `/api/cron/email-sync` or standalone `src/workers/email-worker.ts` (`yarn worker:email`).
   - Also triggered via `.github/workflows/email-sync-cron.yml`.
3. **Inbound Forwarding Webhook**:
   - Resend Inbound posts signed payloads to `POST /api/webhooks/resend/inbound`.
   - `src/lib/sync/resend-webhook-verifier.ts` verifies the webhook signature (`RESEND_INBOUND_WEBHOOK_SECRET`), and `src/lib/sync/inbound-email-service.ts` extracts text/attachments into `InboundEmailAttachment` and multi-module import queues.

---

## Security Headers, Theming & PWA

- **HTTP Security Headers (`next.config.ts`)**: Sets `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (so in-app camera & QR scanners can access `getUserMedia` while third-party origins stay blocked), and a scoped `Content-Security-Policy` (allowing self, Next.js hydration/fonts, `blob:`/`data:` scanner/image previews, `cdnjs.cloudflare.com` PDF.js worker, Google avatars/Drive thumbnails, Vercel Analytics, and Google/Microsoft OAuth `form-action` redirects).
- **Dark-First Theming**:
  - `src/app/layout.tsx` includes a blocking pre-hydration inline script defaulting missing `localStorage.getItem("theme")` to `"dark"` (and resolving `"system"` against `prefers-color-scheme`) before first paint.
  - `src/components/providers/ThemeProvider.tsx` manages `"light"`, `"dark"`, and `"system"` preferences with `defaultTheme="dark"`.
- **PWA & Offline Support**:
  - `public/manifest.json` defines standalone dark display metadata (`background_color` & `theme_color`: `#0b0e14`).
  - `public/sw.js` provides service worker registration for offline shell support (`/offline`) and Web Push event handling (`PWAInstallButton`, `OfflineBanner`).

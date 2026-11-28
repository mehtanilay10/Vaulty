# Vaulty

**Vaulty** is a private personal and family information workspace combining Google Drive-backed document management, multi-page camera scanning, zero-knowledge credentials & 2FA authenticator, multi-currency wealth ledgers, tri-mode notes, email auto-sync, recurring reminders, and Gemini AI understanding.

---

## Key Capabilities

- **Documents, Folders & Camera Scanner**
  - Organizes personal documents synced directly with your Google Drive (`Folder`, `Document`, tags, sharing links, expiry date tracking).
  - Capture physical paperwork with interactive 4-corner perspective rectification (`src/lib/scanner/perspective.ts`) and append pages onto existing PDFs (`src/lib/scanner/pdf-stitcher.ts`).
  - Automatic AI summarization, structured metadata extraction, expiry detection, and contextual document Q&A powered by Gemini (`@google/genai`) with multi-key rotation.
- **Zero-Knowledge Credentials & 2FA Authenticator**
  - Client-side Web Crypto envelope encryption (`AES-256-GCM`, random per-record DEK, `PBKDF2` SHA-256 at `600,000` iterations).
  - Manages app logins (including live 30-second TOTP codes via `otpauth://` QR scanner) and banking credentials (NetBanking, ATM PIN, UPI PIN, Mobile App PIN, Transaction PIN).
  - Offline recovery key + re-keying flow and optional cross-device App Lock PIN with inactivity auto-lock.
- **Wealth & Local PDF Statement Parsing**
  - Multi-currency net worth tracking across 8 currencies (`INR`, `USD`, `EUR`, `GBP`, `AED`, `CAD`, `AUD`, `SGD`) and 13 account types (assets & liabilities).
  - Parse CSV, Excel, or encrypted PDF bank statements — protected PDFs are unlocked locally in the browser (`pdfjs-dist`) using configurable personal password templates before parsing.
- **Notes, Reminders & Notifications**
  - Tri-mode Notes workspace (`NotePage` with TipTap Markdown/rich text, interactive checklists, and image attachments).
  - Recurring reminders (`NONE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`) with custom advance offsets, list & calendar views, email notifications (Resend), and browser Web Push (`PushSubscription`).
- **Email Auto-Sync & Inbound Forwarding**
  - Connect **Gmail**, **Microsoft Outlook**, or a personal **Resend inbound forwarding alias** (`INBOUND_EMAIL_DOMAIN`).
  - Automatically classifies incoming emails into three review queues: Wealth Transactions, Document Attachments, and Bill/Renewal Reminders.
- **AI Chat & Family Sharing**
  - Ask natural-language questions across your document vault (`/chat`).
  - Invite family members with per-module boolean toggles (`Documents`, `Wealth`, `Credentials`, `Reminders`, `Notes`) and client-side public/private wrapped vault keys.
- **PWA, Analytics & Export**
  - Obsidian dark-first PWA (`public/manifest.json`, `public/sw.js`), Command Palette (`Cmd/Ctrl + K`), `@vercel/analytics`, global session revocation, and bounded ZIP data takeout.

---

## Tech Stack

| Layer                 | Technology                                                                            |
| :-------------------- | :------------------------------------------------------------------------------------ |
| **Framework**         | Next.js `16.4.5` (App Router), React `19.3.1`, TypeScript (strict)                    |
| **Styling**           | Tailwind CSS `v4`, Plus Jakarta Sans / Newsreader / JetBrains Mono                    |
| **Database**          | PostgreSQL with Prisma `6.3` (`prisma/schema.prisma`)                                 |
| **Authentication**    | Auth.js `v5` (`next-auth@^5.0.0-beta.32`) — Google OAuth & Resend Magic Links         |
| **AI**                | `@google/genai` (Gemini multi-key rotation & background workers)                      |
| **Integrations**      | Google Drive API, Gmail API, Microsoft Graph (Outlook), Resend, Web Push (`web-push`) |
| **Analytics**         | `@vercel/analytics`                                                                   |
| **Testing & Tooling** | Vitest `5.1`, Playwright, ESLint, Prettier, Yarn `4.5.3`                              |

---

## Getting Started

### 1. Install Dependencies

```bash
yarn install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local` (or `.env`) and provide at least:

- `DATABASE_URL` (PostgreSQL connection string)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `CSRF_SECRET`
- `RESEND_API_KEY`, `EMAIL_FROM` (and `RESEND_INBOUND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN` for inbound email sync)
- `GEMINI_API_KEY_1` (plus optional `_2`, `_3`)
- Optional integrations: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `CRON_SECRET`, `GOOGLE_DRIVE_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`

See [`.agents/DEVELOPMENT.md`](file:///d:/GitHub/Vaulty/.agents/DEVELOPMENT.md) for the complete variable reference.

### 3. Push Schema & Start Dev Server

```bash
yarn db:generate
yarn db:migrate
yarn dev
```

Open `http://localhost:3000`. In local development (`NODE_ENV=development`), `/api/dev-login` can also authenticate `DEV_LOGIN_EMAIL`.

---

## Common Commands

| Command             | Description                                            |
| :------------------ | :----------------------------------------------------- |
| `yarn dev`          | Start Next.js development server                       |
| `yarn build`        | Generate Prisma Client and run production `next build` |
| `yarn type-check`   | Run TypeScript strict type-check (`tsc --noEmit`)      |
| `yarn lint`         | Run ESLint across repository                           |
| `yarn test`         | Run Vitest unit & route tests                          |
| `yarn test:e2e`     | Run Playwright E2E suite                               |
| `yarn ai:worker`    | Run standalone Gemini AI document worker               |
| `yarn worker:email` | Run standalone Gmail/Outlook sync worker               |
| `yarn db:studio`    | Open Prisma Studio                                     |

---

## Repository Structure

```text
src/
  app/                 App Router pages, loading skeletons, API route handlers, landing & auth pages
  proxy.ts             Request middleware (sessionVersion enforcement, public bypass, CSRF cookies)
  components/          Feature components & reusable primitives (ui/, shell/, landing/, passwords/, wealth/, documents/, notes/, reminders/, family/)
  lib/                 Authz, Web Crypto envelope encryption, TOTP, scanner, storage, AI, email & sync pipelines
  workers/             Standalone background workers (ai-worker.ts, email-worker.ts)
prisma/                schema.prisma (39 models, 16 enums), migrations, seed
public/                manifest.json, sw.js, SVG brand icons
.agents/               Detailed engineering guides (PRODUCT, ARCHITECTURE, SECURITY_AND_CRYPTO, DATA_MODEL, API, DEVELOPMENT, CODING_CONVENTIONS, UI_DESIGN_SYSTEM)
```

---

## Documentation

For detailed technical references, see [`.agents/AGENTS.md`](file:///d:/GitHub/Vaulty/.agents/AGENTS.md).

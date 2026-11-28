# Vaulty — AI Agent & Developer Guide

> **Source of truth:** All documentation under `.agents/` and `README.md` is derived directly from the checked-in repository (`src/`, `prisma/`, `public/`, `package.json`, `vercel.json`, `.github/`). Verify code before relying on behavior that may have changed.

## Mission

Vaulty is a private personal and family information workspace for Google Drive-backed documents & multi-page camera scans, zero-knowledge credentials & 2FA TOTP authenticators, multi-currency wealth ledgers & statement imports, tri-mode Markdown notes, email auto-sync, recurring reminders, and Gemini AI understanding.

---

## Documentation Index

| Document                                                                                | Scope                                                                                                                                                        |
| :-------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`AGENTS.md`**](file:///d:/GitHub/Vaulty/.agents/AGENTS.md)                           | Entry point, non-negotiable engineering rules, repository map, and safe change workflow                                                                      |
| [**`PRODUCT.md`**](file:///d:/GitHub/Vaulty/.agents/PRODUCT.md)                         | App surfaces, sidebar navigation order, feature modules, and end-to-end user workflows                                                                       |
| [**`ARCHITECTURE.md`**](file:///d:/GitHub/Vaulty/.agents/ARCHITECTURE.md)               | Next.js runtime topology, `src/proxy.ts` request gate, Google Drive, Gemini workers, Email/Push, PWA, and `@vercel/analytics`                                |
| [**`SECURITY_AND_CRYPTO.md`**](file:///d:/GitHub/Vaulty/.agents/SECURITY_AND_CRYPTO.md) | Client-side AES-256-GCM envelope encryption, PBKDF2, offline recovery, App Lock, local PDF decryption, CSRF, and PostgreSQL rate limiting                    |
| [**`DATA_MODEL.md`**](file:///d:/GitHub/Vaulty/.agents/DATA_MODEL.md)                   | PostgreSQL & Prisma schema (`prisma/schema.prisma`): 39 models, 16 enums, compound indexes, and migration rules                                              |
| [**`API.md`**](file:///d:/GitHub/Vaulty/.agents/API.md)                                 | Verified REST API catalog across all route handlers under `src/app/api/`, including auth, CSRF, and cron/webhook protection                                  |
| [**`DEVELOPMENT.md`**](file:///d:/GitHub/Vaulty/.agents/DEVELOPMENT.md)                 | Environment setup, `.env.example` keys, Yarn 4.5.3 scripts, standalone workers, Vitest/Playwright testing, and troubleshooting                               |
| [**`CODING_CONVENTIONS.md`**](file:///d:/GitHub/Vaulty/.agents/CODING_CONVENTIONS.md)   | Server/client boundaries, $N+1$ query prevention, validation, error sanitization, and TypeScript rules                                                       |
| [**`UI_DESIGN_SYSTEM.md`**](file:///d:/GitHub/Vaulty/.agents/UI_DESIGN_SYSTEM.md)       | Obsidian Atelier / Warm Alabaster semantic tokens, typography, primitive library, native `<dialog>` modals, breadcrumbs & skeletons, and 3D landing showcase |

---

## Non-Negotiable Engineering Rules

1. **Inspect before editing:** Read the target page/route, client component, lib helper, Prisma model, and tests before modifying behavior.
2. **Treat checked-in code as truth:** Never document or build against stale assumptions; keep `.agents/*.md` and `README.md` synced when behavior, routes, schemas, or env vars change.
3. **Enforce authorization server-side:** Never rely on hidden UI controls. Verify ownership, direct folder/document shares, family module flags (`shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`, `shareNotes`), and credential vault access on every protected endpoint.
4. **Authenticate and validate at API boundaries:** Enforce Auth.js sessions + `sessionVersion` checks, explicit input validation (Zod/bounds checks), and HMAC double-submit CSRF validation (`src/lib/csrf.ts`) on cookie-authenticated mutations.
5. **Respect the existing stack:** Next.js `16.4.5` (App Router), React `19.3.1`, TypeScript strict mode, Tailwind CSS `v4`, Prisma `6.3`, PostgreSQL, Auth.js `v5` beta, `@google/genai`, Yarn `4.5.3`, and `@vercel/analytics`.
6. **Use Prisma migrations cleanly:** Schema edits require an ordered Prisma migration and updated `DATA_MODEL.md`. Avoid unmigrated production schema drift.
7. **Protect secrets and plaintext:** Never log OAuth tokens, master passwords, recovery keys, unencrypted credential fields, full inbound emails, or storage IDs/paths in API error payloads.
8. **Avoid $N+1$ database queries:** Push authorization filters into Prisma `where` clauses or batch queries; do not await per-item database calls inside loops.
9. **Use PostgreSQL-backed rate limiting:** Never store rate-limit state in in-memory `Map` instances. Use `consumeSecurityAttempt` / `userRateLimitResponse` backed by `SecurityRateLimit` (`src/lib/security-rate-limit.ts`, `src/lib/rate-limits.ts`).
10. **Enforce strict resource bounds:** Respect ZIP takeout ceilings, `MAX_UPLOAD_SIZE`, PBKDF2 iteration bounds, and non-blocking memory conversions (`Buffer` / `Uint8Array`).
11. **Preserve UI discipline:** Use `src/components/ui/` primitives, semantic design tokens (`globals.css`), at most one primary solid button per visual section, breadcrumb headers (`PageHeader.tsx`) paired with matching `loading.tsx` skeletons, and accessible keyboard navigation.

---

## Repository Map

```text
src/
  app/
    (app)/             Authenticated App Router routes + route-level loading.tsx skeletons
    auth/              Sign-in, sign-out, verify-request, and master-password reset pages
    share/[token]/     Public shared document viewer
    offline/           PWA offline fallback page
    api/               REST API handlers, webhooks, cron triggers, and admin endpoints
    globals.css        Tailwind v4 @theme tokens, Obsidian Dark / Alabaster Light variables, 3D animations
    layout.tsx         Root font setup, dark-first inline theme script, providers, SiteFooter, <Analytics />
    page.tsx           Public landing page integrating <Vault3DShowcase />
  proxy.ts             Next.js request middleware: auth sessionVersion checks, public paths, CSRF cookie issuance
  components/
    app-lock/          Cross-device PIN lock overlay & context (AppLockProvider, AppLockScreen)
    auth/              AuthShell, SignInButton(s)
    chat/              AI Chat interface (ChatClient)
    dashboard/         DashboardOverviewClient (responsive 3-column bento overview)
    documents/         CameraScanModal, DocumentDetailClient, DocumentPropertiesModal, DocumentQA, ShareModal, UploadModal
    family/            FamilyClient, FamilyCredentialsClient, FamilyModulePicker, FamilyAcceptClient
    folders/           FoldersClient, FolderDetailClient, CreateFolderModal, FolderPropertiesModal
    icons/             VaultLogo
    landing/           Vault3DShowcase (4-scene interactive CSS 3D product animation)
    notes/             NotesClient, NoteEditor (TipTap), NoteMarkdown
    notifications/     NotificationsClient, PushNotificationSetup
    passwords/         PasswordsClient, PasswordCard, AuthenticatorCard, PasswordForm, QRScannerModal, RecoverySetupModal
    providers/         ThemeProvider (dark default), SessionProvider, FeedbackProvider
    reminders/         RemindersClient, ReminderCalendarClient
    search/            SearchClient
    settings/          SettingsClient, MasterPasswordManager, PdfPasswordSettings
    shared/            SharedClient (documents shared with user)
    shell/             AppShell, Sidebar, Navbar, MobileNav, PageHeader, CommandPalette, NotificationsBell, AppFooter, SiteFooter
    ui/                Badge, Blade, Breadcrumbs, Button, Card, CommandBar, DocumentViewer, Dropdown, FolderTreeSelect, Modal (<dialog>), Skeleton, StatCard, Tabs, etc.
    wealth/            AccountCard, AccountList, AccountFormModal, TransactionList, TransactionFormModal, MergeAccountModal, BulkDeleteAccountModal, WealthBreakdownChart, WealthSummaryCard
  lib/                 Authz, envelope-crypto, family-crypto, key-wrap, key-recovery, totp, pdf-passwords, statement-parser, ai/, gmail/, outlook/, google-drive/, scanner/, storage/, sync/
  types/               Shared TypeScript domain and DTO definitions
  workers/             Standalone background runners (ai-worker.ts, email-worker.ts)
prisma/
  schema.prisma        PostgreSQL schema (39 models, 16 enums)
  migrations/          Ordered SQL migrations
public/
  manifest.json        PWA web app manifest
  sw.js                Service worker
.github/workflows/     CI, CodeQL, Playwright E2E, ai-worker-cron, email-sync-cron
```

---

## Safe Change Workflow

1. Inspect affected App Router pages, client components, API handlers, `src/lib/` services, Prisma models, and tests.
2. Follow established patterns for auth, CSRF (`src/lib/csrf-client.ts` on client mutations), validation, and rate limiting.
3. Wrap multi-table updates in `prisma.$transaction`.
4. Ensure any new route under `src/app/(app)/` has breadcrumb configuration in `src/components/shell/PageHeader.tsx` and a matching `loading.tsx` skeleton.
5. Update relevant `.agents/*.md` documentation and `README.md`.
6. Run verification: `yarn type-check`, `yarn lint`, `yarn test`, and build check.

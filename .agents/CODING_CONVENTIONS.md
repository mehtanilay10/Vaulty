# Coding & UI/UX Conventions

## 1. Stack & Directory Structure

- **Core Stack:** Next.js 16.4.5 App Router, React 19.3.1, TypeScript (strict mode), Tailwind CSS v4, Prisma 6.3, Auth.js v5 beta.
- **Package Manager:** Yarn 4.5.3 pinned via `packageManager` in `package.json`.
- **Path Aliases:** `@/*` maps to `src/*`.

### File Placement Conventions

- `src/app/`: App Router route handlers, pages, and layouts.
- `src/components/<feature>/`: Feature-specific UI components (e.g. `src/components/documents/`, `src/components/wealth/`, `src/components/notes/`).
- `src/components/ui/`: Shared domain-agnostic UI primitives (`Button`, `Card`, `Input`, `Modal`, `Blade`, `Skeleton`, `CommandBar`, `FolderTreeSelect`, etc.).
- `src/components/shell/`: Global navigation and layout shell (`Navbar`, `Sidebar`, `AppShell`, `MobileNav`, `PageHeader`, `SiteFooter`).
- `src/lib/`: Domain services, server helpers, external client wrappers, and crypto utilities.
- `src/types/`: Shared TypeScript domain and DTO interfaces.
- `src/workers/`: Entry points for standalone background workers (`ai-worker.ts`, `email-worker.ts`).
- `prisma/`: Prisma schema, ordered SQL migrations, and database seed script.

---

## 2. Server vs. Client Boundaries

- **Secret Isolation:** Keep Prisma, Google APIs, Gemini SDK, Resend client, and server-side cryptographic keys in server-only modules and route handlers. Never import server modules into client components (`"use client"`).
- **Serializable Props:** Pass plain serializable values from server components to client components. Convert `Date` instances, Prisma `Decimal` types, and BigInts deliberately.
- **Data Fetching:** Fetch initial data in server page components (`page.tsx`) and pass it to client components. Avoid duplicate client fetches on mount when the page already provides initial state.
- **Client State:** Reserve `"use client"` for components managing user interaction, local state, form validation, Web Crypto, TipTap editor instances, or browser APIs.

---

## 3. API Handler Standards & Query Performance

- **Authentication:** Always derive user identity server-side using `auth()` or `getCurrentUser()`. Never trust client-supplied `userId` or `ownerId`.
- **Validation:** Validate all request bodies, search params, and route parameters with Zod schemas or explicit validators before querying. Enforce character caps on sensitive ciphertext payloads (e.g. 100,000 characters).
- **Double-Submit CSRF:** Require valid `x-csrf-token` headers matching `csrf-token` cookies for all state-changing mutations (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Eliminate $N+1$ Database Queries:**
  - Scope queries using database `where` clauses (`ownerId: user.id`, direct shares, or family membership).
  - Perform permission validations in memory across candidate rows rather than awaiting per-item database round-trips inside loops across remote PostgreSQL.
- **Distributed Rate Limiting:** Never use in-memory `Map` counters for rate limiting. Use the PostgreSQL-backed sliding window rate limiter (`consumeSecurityAttempt` on `SecurityRateLimit`), which persists across serverless instances and provides `Retry-After` headers on 429.
- **Memory & Resource Safety:**
  - Scrypt password hashing/verification must configure `{ maxmem: 128 * 1024 * 1024 }` to prevent memory exhaustion and process termination.
  - Large binary buffer conversions must use indexed byte loops instead of spreading bytes into `String.fromCharCode(...bytes)` to prevent call stack overflow.
  - Takeout archives must enforce cumulative byte and file budgets (50MB/file, 200MB total) to avoid memory spikes.
- **Cryptographic Randomness:** Use `crypto.randomInt` for generating random tokens from character dictionaries to eliminate modulo bias.
- **Atomic Operations:** Wrap multi-record mutations in `prisma.$transaction`.
- **Idempotency:** Assign unique, deterministic `idempotencyKey` strings for notifications and background queue operations.

---

## 4. UI / UX & Visual Design System

### Visual Direction

Vaulty uses a bespoke personal finance and vault aesthetic: clean neutral surfaces, a crisp cobalt-sapphire brand foundation, readable typography, purposeful whitespace, and distinctive domain-specific accents:

- **Documents:** Sapphire (`#1D4ED8` / `text-blue-600`)
- **Credentials:** Royal Amethyst (`#7C3AED` / `text-purple-600`)
- **Wealth:** Forest Emerald (`#059669` / `text-emerald-600`)
- **Reminders:** Warm Amber (`#D97706` / `text-amber-600`)
- **Family:** Coral Rose (`#E11D48` / `text-rose-600`)
- **AI Intelligence:** Steel Cyan (`#0891B2` / `text-cyan-600`)

Avoid generic tropes: no floating action buttons (FABs), no gratuitous multi-color gradients, no dark purplish glows, and no fabricated marketing metrics.

### Theme & Semantic Tokens

- Use semantic CSS tokens defined in `src/app/globals.css`:
  `bg-background`, `bg-surface`, `bg-surface-muted`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `border-border-subtle`, `text-brand`, `bg-brand-subtle`.
- Dark mode is handled via `next-themes` using the `class` attribute.
- Respect reduced motion via `@media (prefers-reduced-motion: reduce)`.

### CommandBar Pattern

- Use `CommandBar` and `CommandBarButton` from `src/components/ui/CommandBar.tsx`.
- **Button Styling:** Flush, squared (`rounded-none`) items with prominent, crisp hover states (`hover:bg-surface-muted hover:text-text-primary active:bg-surface-muted/90`).
- **Action Hierarchy:** Maximum one primary button (`primary` prop, solid brand background with white icon/text) per bar. Far items (`farItems`) host view-mode toggles or auxiliary actions.

### Folder Selection Pattern

- Use `FolderTreeSelect` from `src/components/ui/FolderTreeSelect.tsx` for folder picker dropdowns.
- Never use ASCII art `\u00A0\u00A0└─ 📁` inside native `<select>` tags.
- Provide full path display in the closed trigger button, recursive tree rendering with chevrons, guide lines, search filter, and ARIA listbox accessibility.

### Note Canvas & Text Formatting

- Notes use `NoteEditor` (`src/components/notes/NoteEditor.tsx`) with TipTap integration and `NoteMarkdown` (`src/components/notes/NoteMarkdown.tsx`) for preview.
- **Lists:** Bulleted (`<ul>`) and numbered (`<ol>`) lists must preserve explicit list-style markers (`disc`, `decimal`, and nested markers) in `.prose` and `.note-tiptap-body`.
- **To-Do / Tasks:** Render task items as inline flex rows (`display: flex; flex-direction: row; align-items: flex-start; gap: 0.5rem;`) with zero-margin paragraphs, keeping checkboxes and text strictly aligned on the same row.
- **Images:** Markdown image previewers must support `data:image/*` and `blob:*` URIs via custom `urlTransform`.

### Layout & Padding Cadence

- Main container layout uses tighter, disciplined vertical spacing: `py-4 sm:px-5 md:py-5 lg:px-7` with `space-y-4 sm:space-y-5`.
- Avoid bloated outer margins or stacked duplicated headers.

### Loading & Skeletons

- Always guard dropdown feeds (such as `NotificationsBell`) with a `hasLoaded` flag and high-contrast pulse skeletons (`bg-border-subtle`) to eliminate empty white/dark flashes.

### Accessibility Standards

- All interactive controls must support keyboard navigation (`tabIndex={0}`, Enter, Space, Escape).
- Interactive dialogs and blades must trap focus and close on Escape or backdrop click.
- Maintain WCAG AA contrast compliance across all text and icon tokens in both light and dark modes.

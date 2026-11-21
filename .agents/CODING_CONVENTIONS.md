# Coding & UI/UX Conventions

## 1. Stack & Directory Structure

- **Core Stack:** Next.js 16.4.5 App Router, React 19.3.1, TypeScript (strict mode), Tailwind CSS v4, Prisma 6.3, Auth.js v5 beta.
- **Package Manager:** Yarn 4.5.3 pinned via `packageManager` in `package.json`.
- **Path Aliases:** `@/*` maps to `src/*`.

### File Placement Conventions

- `src/app/`: App Router route handlers, pages, and layouts.
- `src/components/<feature>/`: Feature-specific UI components (e.g. `src/components/documents/`, `src/components/wealth/`).
- `src/components/ui/`: Shared domain-agnostic UI primitives (`Button`, `Card`, `Input`, `Modal`, `Blade`, `Skeleton`, etc.).
- `src/components/shell/`: Global navigation and layout shell (`Navbar`, `Sidebar`, `AppShell`, `MobileNav`, `PageHeader`, `SiteFooter`).
- `src/lib/`: Domain services, server helpers, external client wrappers, and crypto utilities.
- `src/types/`: Shared TypeScript domain and DTO interfaces.
- `src/workers/`: Entry points for standalone background workers (`ai-worker.ts`, `email-worker.ts`).
- `prisma/`: Prisma schema, ordered SQL migrations, and database seed script.

---

## 2. Server vs. Client Boundaries

- **Secret Isolation:** Keep Prisma, Google APIs, Gemini SDK, Nodemailer, and server-side cryptographic keys in server-only modules and route handlers. Never import server modules into client components (`"use client"`).
- **Serializable Props:** Pass plain serializable values from server components to client components. Convert `Date` instances, Prisma `Decimal` types, and BigInts deliberately.
- **Data Fetching:** Fetch initial data in server page components (`page.tsx`) and pass it to client components. Avoid duplicate client fetches on mount when the page already provides initial state.
- **Client State:** Reserve `"use client"` for components managing user interaction, local state, form validation, Web Crypto, or browser APIs.

---

## 3. API Handler Standards & Query Performance

- **Authentication:** Always derive user identity server-side using `auth()` or `getCurrentUser()`. Never trust client-supplied `userId` or `ownerId`.
- **Validation:** Validate all request bodies, search params, and route parameters with Zod schemas or explicit validators before querying. Enforce character caps on sensitive ciphertext payloads (e.g. 100,000 characters).
- **Double-Submit CSRF:** Require valid `x-csrf-token` headers matching `csrf-token` cookies for all state-changing mutations (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Eliminate $N+1$ Database Queries:**
  - Scope queries using database `where` clauses (`ownerId: user.id`, direct shares, or family membership).
  - Perform permission validations in memory across candidate rows rather than awaiting per-item database round-trips inside loops across remote PostgreSQL/Neon.
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

### Typography Scale

- **Section Eyebrows (`.section-eyebrow`):** Styled at 11.5px with 700 bold weight and uppercase letter spacing (`tracking-wider`).
- **Body & Metadata:** Metadata and secondary dates must be styled at 11px minimum for legibility and WCAG contrast.
- **User Greetings:** Greeting headers must capitalize names (e.g. "Welcome back, Nilay").

### Layout & Hierarchy Standards

- **Single Solid Primary CTA Rule:** Maintain visual hierarchy by displaying exactly one solid primary button per page section (e.g. on `/wealth`, "Add account" is solid primary; "Import statement" is secondary).
- **Navigation Action Layering:** Action containers in `Navbar.tsx` use `z-20` and the center search trigger wrapper uses `pointer-events-none` (with `pointer-events-auto` on the interactive trigger) so action buttons (theme toggle, notifications, profile, Quick Action) are never occluded at ~1280px.
- **PageHeader Title Wrapping:** `PageHeader.tsx` uses `break-words` with `truncateTitle?: boolean` (defaults to `false`), preventing premature truncation of multi-word headers like "Wealth Management".
- **Segmented Control Standard:** Toggle between related visual perspectives (e.g. List vs. Calendar in Reminders) using a unified inline segmented switch (`[ List | Calendar ]`).
- **Tabs Component:** Tab lists enforce `overflow-y-hidden` with `overflow-x-auto` to prevent vertical scrollbar jitter, rendering bottom border indicators cleanly within button boundaries.

### Shared UI Primitives

Always reuse existing components in `src/components/ui/` rather than creating parallel elements:

- `Button`: Primary, secondary, outline, ghost, danger, and sub-variants with loading spinners.
- `Blade`: Slide-over drawer for detail views and creation forms.
- `Modal`: Centered dialog on desktop, auto-adapting to bottom sheet on mobile viewports.
- `Skeleton`: Animated placeholder loaders for data-fetching states.
- `EmptyState`: Standardized empty state card with icon, title, description, and primary CTA.

### Accessibility Standards

- All interactive cards (such as notification items and document list rows) must be keyboard accessible with `role="button"`, `tabIndex={0}`, and Enter/Space event handlers.
- Deterministic date formatting (`formatNotificationDate("en-US")`) must be used on server and client to eliminate hydration mismatches.
- Ensure high contrast on destructive actions (e.g. `text-danger hover:bg-danger-subtle`).
- Provide visible focus rings on all inputs and buttons.

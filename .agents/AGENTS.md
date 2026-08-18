# Vaulty — AI Agent Instructions

## Project Overview

Vaulty is a private family document vault. Users authenticate via Google OAuth, organize documents in nested folders, and can optionally run Gemini AI analysis on documents. Folder sharing with recursive read-only access is supported.

## Tech Stack

- **Framework**: Next.js 16.3.1 (App Router)
- **Runtime**: React 19.2.8, TypeScript 5
- **Styling**: Tailwind CSS 4 (`@tailwindcss/postcss`), CSS custom properties in `src/app/globals.css`
- **ORM**: Prisma 6.3.0 with PostgreSQL (Neon)
- **Auth**: NextAuth v5 beta (`next-auth@5.0.0-beta.32`) with `@auth/prisma-adapter`
- **Storage**: Vercel Blob (private) and Google Drive (via `googleapis`)
- **AI**: Google Gemini (`@google/genai`)
- **Utilities**: lucide-react, clsx, tailwind-merge, react-markdown, remark-gfm, zod
- **Theme**: next-themes (dark/light)
- **Package manager**: Yarn 4.5.3 (`nodeLinker: node-modules`)

## Architecture Overview

Next.js App Router with Server Components for data fetching and Client Components (`"use client"`) for interactivity. Authorization is enforced server-side before any data access. A central authorization engine in `src/lib/authz.ts` handles folder/document access checks with recursive share inheritance.

## Important Directories

- `src/app/` — App Router pages and layouts
- `src/app/api/` — API route handlers
- `src/components/` — React components
  - `shell/` — Layout shell (Navbar, Sidebar, MobileNav, AppShell, PageHeader)
  - `ui/` — Shared UI primitives (Button, Card, Modal, Badge, Input, etc.)
  - `dashboard/`, `documents/`, `folders/`, `search/`, `settings/`, `shared/` — Feature components
  - `providers/` — SessionProvider, ThemeProvider
  - `auth/` — Auth UI
  - `icons/` — SVG logos
- `src/lib/` — Server-side utilities and libraries
  - `authz.ts` — Central authorization engine
  - `prisma.ts` — Prisma client singleton
  - `blob.ts` — Vercel Blob upload/delete utilities
  - `gemini.ts` — Gemini AI processing
  - `google-drive/` — Google Drive OAuth and helpers
  - `storage/` — Storage provider abstraction (Google Drive + Vercel Blob)
  - `utils.ts` — `cn()` helper
- `src/hooks/` — Client-side hooks (`useGoogleDriveStatus`)
- `src/types/` — TypeScript type augmentations
- `prisma/` — Prisma schema and migrations
- `public/` — Static assets (manifest, icons)

## Package Manager

Use **Yarn** (`yarn`). Do not use npm or pnpm.

## Development Commands

```bash
yarn dev              # Start dev server
yarn build            # Generate Prisma client + build
yarn start            # Start production server
yarn lint             # Run ESLint
yarn type-check       # Run TypeScript compiler (noEmit)
yarn db:generate      # Generate Prisma client
yarn db:push          # Push schema to database
yarn db:studio        # Open Prisma Studio
yarn db:migrate       # Run migrations
yarn db:seed          # Seed database (no seed file currently exists)
```

## Build Commands

```bash
yarn build
```

Vercel build script:
```bash
yarn vercel-build     # prisma generate && prisma migrate deploy && next build
```

## Lint / Type-check / Test Commands

```bash
yarn lint
yarn type-check
```

There are **no test scripts** configured in package.json. Tests are not currently implemented.

## Coding Conventions

### Server/Client Component Rules

- **Page files** (`src/app/**/page.tsx`) are **Server Components** by default.
- **Client Components** must have `"use client"` at the very top.
- Data fetching happens in Server Components using `auth()` and `prisma`.
- Data is serialized with `JSON.parse(JSON.stringify(data))` before passing to Client Components.
- Do not import server-only modules (e.g., `prisma`, `@auth/prisma-adapter`) into Client Components.

### Data-Fetching Conventions

- Fetch data in Server Components using `auth()` from `@/auth` and `prisma` from `@/lib/prisma`.
- Use `await auth()` to get the session.
- Use `notFound()` from `next/navigation` for unauthorized or missing resources on detail pages.
- Always call authorization checks (`checkDocumentAccess`, `checkFolderAccess`) before fetching resource data in API routes and page files.
- For list pages, scope queries by `ownerId: userId` when appropriate.

### API Conventions

- API routes use `NextRequest` and `NextResponse`.
- All mutation endpoints require authentication via `getCurrentUser()` from `@/auth`.
- Return JSON with `{ error: "..." }` for errors, appropriate HTTP status codes.
- Use `formData` for file uploads, JSON bodies for mutations.
- Log technical errors server-side with `console.error`; return user-friendly messages.
- Route files are named by resource: `route.ts` at the directory level, with `[id]` for dynamic segments.

### State-Management Conventions

- No global state management library is used.
- Client-side state uses React `useState` in Client Components.
- Server state is refetched via `router.refresh()` after mutations.
- Session state is managed by `next-auth/react` via `SessionProvider`.

### Styling Conventions

- Use Tailwind CSS utility classes.
- Prefer semantic CSS custom properties from `globals.css` (e.g., `bg-surface`, `text-text-primary`, `border-border-subtle`).
- Component classes: `.card`, `.card-hover`, `.card-elevated`, `.input`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.badge`, `.modal-overlay`, `.modal-content`.
- Default theme is `dark` (configured in `ThemeProvider`).
- Use `cn()` from `@/lib/utils` for conditional class merging.

### Error-Handling Conventions

- Server-side: wrap API logic in `try/catch`, log with `console.error`, return `{ error: "..." }` with status code.
- Client-side: display errors inline in modals or alert components (`Alert`).
- Use `notFound()` for unauthorized access on detail pages.
- Never expose stack traces, database errors, API keys, or tokens to the client.

### Validation Conventions

- Use `zod` for validation where applicable.
- Validate file type, extension, and size server-side in `src/lib/blob.ts`.
- Validate folder ownership and permissions server-side in API routes.
- Do not rely on client-side validation for security.

### Naming Conventions

- **Files**: PascalCase for components (`DashboardClient.tsx`), camelCase for hooks (`useGoogleDriveStatus.ts`), kebab-case for utilities where used.
- **Components**: PascalCase.
- **Functions**: camelCase.
- **Constants**: UPPER_SNAKE_CASE for true constants.
- **Database models**: PascalCase (Prisma convention).
- **Routes**: kebab-case or camelCase as appropriate for Next.js App Router.

### Import Conventions

- Use `@/` path alias for imports from `src/`.
- Group imports: React/Next.js, third-party, internal components, internal lib, internal types, icons.
- Example: `import { auth } from "@/auth"; import { prisma } from "@/lib/prisma";`

### Environment Variables

- Server-side secrets: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`, `GEMINI_API_KEY`.
- Public variables: `NEXT_PUBLIC_APP_URL`.
- Never expose secrets to the client.
- `.env` is git-ignored; `.env.example` documents required variables.

### Security Rules

- **Authorization must happen server-side before returning data**.
- Never trust client-supplied IDs; always verify ownership or share access in the database.
- Private Blob URLs must never be exposed directly as public URLs.
- Document serving goes through `GET /api/documents/[id]/file` with authorization check.
- Gemini API calls must happen server-side only.
- Audit sensitive operations via `AuditLog` model.

### Git / Change-Scope Rules

- Keep changes scoped to the user's request.
- Do not perform large refactors unless explicitly requested.
- Run `yarn lint` and `yarn type-check` after making changes.

### Rules for Adding Dependencies

- Do not add dependencies without explicit request.
- Prefer existing utilities (e.g., `lucide-react` for icons, `clsx` + `tailwind-merge` for classes).
- If a new dependency is needed, explain why and get approval.

### Rules for Database / Schema Changes

- Schema changes must be made in `prisma/schema.prisma` and migrated via `yarn db:migrate`.
- Do not manually alter production database.
- Run `yarn db:generate` after schema changes.

### Rules for Generated Files

- Do not manually edit files in `.next/`, `node_modules/`, or generated migration files.
- Prisma client is generated; do not edit `node_modules/@prisma/client`.

### Definition of Done

- Code follows existing conventions.
- `yarn lint` passes.
- `yarn type-check` passes.
- Authorization is enforced server-side for all protected operations.
- No secrets are exposed to the client.
- Existing behavior is preserved unless the task explicitly requires changing it.
- Search before creating new utilities/components; reuse existing abstractions when appropriate.
- Avoid duplicate implementations and unnecessary dependencies.
# Vaulty Development Progress

## Phase 1: Project Setup & Authentication Infrastructure
- [x] Initialized Git repository (`git init`).
- [x] Initialized Next.js App Router project with TypeScript, Tailwind CSS, App Router, and Yarn.
- [x] Installed core dependencies (`@prisma/client@6.3.0`, `prisma@6.3.0`, `next-auth@beta`, `@auth/prisma-adapter`, `@vercel/blob`, `@google/genai`, `lucide-react`, `clsx`, `tailwind-merge`, `react-markdown`, `zod`, `remark-gfm`).
- [x] Configured PostgreSQL database schema via Prisma with `User`, `Account`, `Session`, `Folder`, `Document`, `Tag`, `DocumentTag`, `FolderShare`, `AiProcessing`, `AuditLog` models.
- [x] Successfully synchronized PostgreSQL database tables (`yarn prisma db push --accept-data-loss`).
- [x] Setup NextAuth Google OAuth 2.0 authentication and Prisma adapter (`src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`).
- [x] Implemented route protection middleware (`src/middleware.ts`).
- [x] Documented environment variables in `.env.example`.
- [x] Created Google Sign-In page (`/auth/signin`) and Landing page (`/`).

## Phase 2: Folder Hierarchy & Private Document Management
- [x] Built Folder API routes (`/api/folders`, `/api/folders/[id]`) supporting nested creation, rename, move, and recursive cascading delete.
- [x] Implemented Vercel Blob private upload service (`src/lib/blob.ts`, `/api/documents/upload`) validating file MIME type, extension, size limits, and owner authorization.
- [x] Implemented authorized streaming proxy endpoint (`/api/documents/[id]/file`) verifying owner or recursive folder share access before serving buffers.
- [x] Built Dashboard page (`/dashboard`), My Documents view (`/documents`), Folder Detail view with breadcrumbs (`/folders/[folderId]`), and Document Detail view (`/documents/[documentId]`).

## Phase 3: Tags, Document Properties & Global Search
- [x] Added free-form tag creation and filtering.
- [x] Created Document Properties Modal and Folder Properties Modal with rename, move, re-tag, AI retry, and deletion controls.
- [x] Implemented permission-aware global search API (`/api/search`) and Search page (`/search`) searching across filenames, folder names, tags, and AI summary text.

## Phase 4: Folder Sharing & Security Authorization Logic
- [x] Implemented central authorization engine (`src/lib/authz.ts`) with recursive folder share inheritance.
- [x] Built User Search API (`/api/users/search`) and Folder Sharing API (`/api/folders/[id]/shares`).
- [x] Enforced strict read-only locks on all mutation operations for shared users.
- [x] Built Shared With Me page (`/shared`) listing top-level folders shared with the user.
- [x] Added privacy-conscious audit logging for folder creations, uploads, deletions, shares, and unshares.

## Phase 5: Gemini AI Document Processing
- [x] Integrated `@google/genai` server-side SDK (`src/lib/gemini.ts`) using `GEMINI_API_KEY`.
- [x] Updated AI engine model to `gemini-2.0-flash`.
- [x] Designed structured JSON output prompt for Gemini (extracted text, Markdown summary, informational interpretation with medical disclaimers and hallucination guards).
- [x] Implemented non-blocking async AI processing workflow (`AiProcessing` status tracking: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`).
- [x] Built UI tabs for AI Summary (rendered Markdown via `react-markdown`), AI Interpretation, and Extracted Text, plus owner-only AI trigger/retry controls.

## Phase 6: Mobile UX, PWA & Final Build
- [x] Built responsive Mobile Navigation Bar (`MobileNav.tsx`) with quick upload action button and touch targets.
- [x] Created PWA Web App Manifest (`public/manifest.json`).

## Feedback & Enhancements Applied
- [x] **Immediate State Updates**: Enabled instant UI feedback and re-fetching on creation/upload.
- [x] **Gemini Model Upgrade**: Updated Gemini API calls and model references from `gemini-2.5-flash` to `gemini-2.0-flash`.
- [x] **Light/Dark Theme Support**: Added `next-themes` theme provider and `ThemeToggle` with dark mode default.
- [x] **User Vercel Blob Hierarchy**: Configured private Vercel Blob paths to strictly match system hierarchy (`vaulty-docs/{UserName}/{FolderPath}/{filename}`).
- [x] **Top 5 Priority Search Suggestions**: Added live auto-suggestion dropdown panel in search bar with priority scoring (Exact Title > Prefix > Tag > Folder > AI Summary).
- [x] **Bespoke Visual Identity Redesign**: Redesigned UI with custom materials, warm gold vault accents, glassmorphism panels, tactile cards, and luxury typography.

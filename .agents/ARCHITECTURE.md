# Vaulty — Architecture Documentation

## Application Structure

```
src/
  app/
    layout.tsx              # Root layout (ThemeProvider + SessionProvider + theme script)
    page.tsx                # Landing page (public)
    globals.css             # Tailwind v4 + CSS custom properties + component classes
    auth/
      signin/
        page.tsx            # Google sign-in page (public)
    dashboard/
      page.tsx              # Dashboard (Server Component → DashboardClient)
    documents/
      page.tsx              # My Documents list (Server → DocumentsClient)
      [documentId]/
        page.tsx            # Document detail (Server → DocumentDetailClient)
    folders/
      page.tsx              # Root folders list (Server → FoldersClient)
      [folderId]/
        page.tsx            # Folder detail (Server → FolderDetailClient)
    search/
      page.tsx              # Search page (Server → SearchClient)
    settings/
      page.tsx              # Account settings (Server → SettingsClient)
      storage/
        page.tsx            # Redirects to /settings (legacy)
    shared/
      page.tsx              # Shared with me (Server → SharedClient)
    sync/
      page.tsx              # Sync center (Server → SyncCenterClient)
    api/
      auth/
        [...nextauth]/
          route.ts          # NextAuth handler
      documents/
        upload/
          route.ts          # POST document upload
        [id]/
          file/
            route.ts        # GET authorized file stream
      folders/
        route.ts            # GET (owned) + POST (create)
        [id]/
          route.ts          # GET (detail) + PATCH + DELETE
          shares/
            route.ts        # POST (share) + DELETE (unshare)
      search/
        route.ts            # GET permission-aware search
      users/
        search/
          route.ts          # GET user search for sharing
      integrations/
        google-drive/
          status/
            route.ts        # GET Drive connection status
          callback/
            route.ts        # Google Drive OAuth callback
  components/
    shell/
      AppShell.tsx           # Shared layout wrapper (Navbar + Sidebar + main + MobileNav)
      Navbar.tsx             # Sticky top bar with search, upload, profile dropdown
      Sidebar.tsx            # Left desktop nav (Dashboard, Folders, Shared)
      MobileNav.tsx          # Bottom mobile nav
      PageHeader.tsx         # Reusable page title + description + actions
      ThemeToggle.tsx        # Dark/light toggle
    providers/
      SessionProvider.tsx    # next-auth/react wrapper
      ThemeProvider.tsx      # next-themes wrapper (default dark)
    ui/
      Button.tsx, Card.tsx, Modal.tsx, Badge.tsx, Input.tsx, Select.tsx,
      Checkbox.tsx, RadioGroup.tsx, Textarea.tsx, Tabs.tsx, Dropdown.tsx,
      EmptyState.tsx, Alert.tsx, Avatar.tsx, Label.tsx, Skeleton.tsx
    auth/
      SignInButton.tsx       # Google sign-in button
    dashboard/
      DashboardClient.tsx    # Dashboard page client
    documents/
      DocumentsClient.tsx, DocumentDetailClient.tsx, UploadModal.tsx,
      DocumentPropertiesModal.tsx
    folders/
      FoldersClient.tsx, FolderDetailClient.tsx, CreateFolderModal.tsx,
      FolderPropertiesModal.tsx
    search/
      SearchClient.tsx
    settings/
      SettingsClient.tsx, StorageSettingsClient.tsx, SyncCenterClient.tsx
    shared/
      SharedClient.tsx
    icons/
      VaultLogo.tsx, VaultLogoMark.tsx, VaultWordmark.tsx
  lib/
    auth.ts                 # NextAuth config + getCurrentUser()
    authz.ts                # Central authorization engine (checkFolderAccess, checkDocumentAccess)
    prisma.ts               # Prisma client singleton
    blob.ts                 # Vercel Blob utilities
    gemini.ts               # Gemini AI processing
    google-drive/
      oauth.ts              # Google Drive OAuth helpers
    storage/
      provider.ts           # StorageProvider interface
      factory.ts            # Provider factory + getProviderForUser/getProviderForDocument
      drive-provider.ts     # Google Drive implementation
      blob-provider.ts      # Vercel Blob implementation
    utils.ts                # cn() helper
    sync/
      sync-engine.ts        # Google Drive sync engine
  hooks/
    useGoogleDriveStatus.ts # Client hook for Drive connection status
  types/
    next-auth.d.ts          # NextAuth session type augmentation
  proxy.ts                  # Auth middleware
  auth.ts                   # NextAuth exported handlers
```

## Routing Architecture

- **App Router** exclusively. No Pages Router.
- **Public routes**: `/` (landing), `/auth/signin`, `/api/auth/*`.
- **Protected routes**: All other routes redirect unauthenticated users to `/auth/signin`.
- **Middleware**: `src/proxy.ts` handles auth redirects for all non-static paths.
- **Dynamic routes**: `/documents/[documentId]`, `/folders/[folderId]`.
- **API routes**: REST-style under `/api/*`.

## Major Application Layers

1. **Pages (Server Components)**: Handle data fetching and authorization.
2. **Client Components**: Handle interactivity, state, and UI composition.
3. **API Routes**: Handle mutations, file streaming, and search.
4. **Lib Layer**: Business logic, authorization, storage abstraction, AI processing.
5. **Data Layer**: Prisma ORM → PostgreSQL.

## Server/Client Boundaries

- Server Components: `src/app/**/page.tsx` (default).
- Client Components: Any file with `"use client"`. Located in `src/components/` and `src/hooks/`.
- Shell components (`AppShell`, `Navbar`, `Sidebar`, `MobileNav`) are Client Components because they use `usePathname`, `useSession`, `useRouter`, or `useGoogleDriveStatus`.
- `AppShell` wraps authenticated page content with navigation.

## Data Flow

1. **Page Load (Server)**:
   - `auth()` gets session.
   - `prisma` queries data with `ownerId` scoping.
   - Data is serialized (`JSON.parse(JSON.stringify())`) and passed to Client Component.
2. **Client Render**:
   - Client Component receives serialized data as props.
   - `router.refresh()` is used to revalidate Server Components after mutations.
3. **Mutations**:
   - Form submission → API route (`POST /api/...`).
   - API validates auth, authorization, and business rules.
   - On success, returns updated data or triggers `router.refresh()` on client.

## API Architecture

REST API routes under `src/app/api/`:

- `GET /api/search` — Permission-aware search across documents, folders, tags, AI summaries.
- `POST /api/documents/upload` — Upload with validation, storage, tagging, AI queue.
- `GET /api/documents/[id]/file` — Authorized file streaming.
- `GET/POST /api/folders` — List owned folders / create folder.
- `POST/DELETE /api/folders/[id]/shares` — Share / unshare folder.
- `GET /api/users/search` — Search users for sharing.
- `GET /api/integrations/google-drive/status` — Drive connection status.

## Authentication Flow

1. User visits `/` or `/auth/signin`.
2. Clicks "Continue with Google" → NextAuth Google provider.
3. NextAuth creates/updates `User`, `Account`, `Session` via PrismaAdapter.
4. JWT session stores `user.id`.
5. `src/proxy.ts` redirects unauthenticated users to `/auth/signin`.
6. On first Google sign-in, `src/auth.ts` `jwt` callback auto-creates a Google Drive connection.

## Database Architecture

- **Provider**: PostgreSQL via Neon (`DATABASE_URL`).
- **ORM**: Prisma 6.3.0.
- **Key models**: `User`, `Folder`, `Document`, `Tag`, `DocumentTag`, `FolderShare`, `AiProcessing`, `AuditLog`, `StorageConnection`, `SyncEvent`.
- **Relationships**:
  - User → owns Folders, Documents, FolderShares, StorageConnections, AuditLogs.
  - Folder → belongs to User, has parent Folder, contains Documents and child Folders, has FolderShares.
  - Document → belongs to User and Folder, has Tags and AiProcessing.
  - FolderShare → links Folder to shared User (READ_ONLY).
- **Indexes**: `ownerId` on User's resources, `folderId` on Documents, `folderId`+`sharedWithUserId` on FolderShare.

## State Management

- No external state management library.
- Client state: React `useState`.
- Server state: Revalidated via `router.refresh()` after mutations.
- Session: `next-auth/react` `useSession`.
- Theme: `next-themes` with `class` strategy.

## Styling/UI Architecture

- **Tailwind CSS v4** via `@tailwindcss/postcss`.
- **Design tokens**: 18 CSS custom properties in `globals.css` (colors for light/dark).
- **Component classes**: `.card`, `.card-hover`, `.card-elevated`, `.input`, `.btn-*`, `.badge`, `.modal-overlay`, `.modal-content`.
- **Theme**: Default dark mode (`defaultTheme="dark"` in ThemeProvider).
- **No component library**: All UI primitives are hand-built in `src/components/ui/`.
- **Icons**: `lucide-react`.

## External Services

- **Google OAuth**: Authentication via `next-auth/providers/google`.
- **Google Drive**: Optional/default storage provider. OAuth flow in `src/lib/google-drive/oauth.ts`. Drive API via `googleapis`.
- **Vercel Blob**: Private file storage via `@vercel/blob`.
- **Google Gemini**: AI processing via `@google/genai`. Server-side only.

## Important Architectural Decisions

- **Authorization-first**: All protected operations verify access in `src/lib/authz.ts` before proceeding.
- **Storage abstraction**: `src/lib/storage/` provides a provider interface so documents can live in Google Drive or Vercel Blob.
- **Async AI**: AI processing is fire-and-forget after upload; failure does not block upload.
- **Private Blob access**: File streaming goes through API routes with auth checks.
- **No admin role**: All users are equal; access is controlled via folder ownership and sharing.
- **No document versioning**: Uploading replaces nothing; each upload is a new document.
- **No account deletion in v1**.

## Areas That Should NOT Be Modified Casually

- `src/lib/authz.ts` — Central authorization logic; changes affect all protected routes.
- `src/auth.ts` — NextAuth configuration; changes affect all authentication.
- `src/proxy.ts` — Auth middleware; changes affect route protection.
- `prisma/schema.prisma` — Database schema; requires migrations.
- `src/app/globals.css` — Global design tokens and component classes.
- `src/lib/storage/provider.ts` — Storage provider interface contract.
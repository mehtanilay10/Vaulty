# Vaulty — Complete UI/UX Audit Report (Sections 1–15)

**Generated:** 2026-08-17  
**Scope:** Full application UI/UX baseline audit  
**Purpose:** Baseline documentation for future modernization and consistency improvements

---

## 1. Executive Summary

**Vaulty** is a private family document vault web application built with **Next.js 16 (App Router)**, **React 19**, **TypeScript 5**, and **Tailwind CSS v4**. It uses **NextAuth v5** (Google OAuth) for authentication, **Prisma + PostgreSQL** for data persistence, **Vercel Blob** and **Google Drive** for document storage, and **Gemini 2.0 Flash** for AI-powered document analysis (OCR, summaries, interpretations).

The application is a single-page dashboard-style app with a sidebar navigation, top navbar, and mobile bottom navigation. It supports dark/light themes via `next-themes`. There is **no UI component library** — all components are hand-built using Tailwind CSS utility classes and a small set of custom CSS component classes (`.vault-card`, `.vault-btn-primary`, `.vault-btn-secondary`, `.vault-input`, `.glass-panel`).

The design language is modern, clean, and consistent, using an indigo/violet primary palette with emerald and amber accent colors. However, there are notable architectural inconsistencies in how layouts are composed, duplicated component patterns, and inconsistent page-level structures.

---

## 2. Technology / UI Architecture

### Core Stack
| Technology | Version | Role |
|---|---|---|
| Next.js | 16.3.1 | Framework (App Router) |
| React | 19.2.8 | UI Library |
| TypeScript | 5 | Language |
| Tailwind CSS | 4 | Styling (via `@tailwindcss/postcss`) |
| next-themes | 0.4.6 | Dark/light theme |
| NextAuth | 5.0.0-beta.32 | Authentication |
| lucide-react | 1.31.0 | Icons |
| react-markdown | 10.1.0 | Markdown rendering |
| Prisma | 6.3.0 | ORM |
| Zod | 4.4.3 | Validation |

### Project Structure
```
src/
├── app/
│   ├── layout.tsx              # Root layout (ThemeProvider + SessionProvider)
│   ├── page.tsx                # Landing page
│   ├── globals.css             # Tailwind + custom CSS + theme tokens
│   ├── auth/signin/page.tsx    # Sign-in page
│   ├── dashboard/page.tsx      # Dashboard
│   ├── documents/
│   │   ├── page.tsx            # Documents list
│   │   └── [documentId]/page.tsx  # Document detail
│   ├── folders/
│   │   ├── page.tsx            # Folders list
│   │   └── [folderId]/page.tsx    # Folder detail
│   ├── search/page.tsx         # Search
│   ├── settings/
│   │   ├── page.tsx            # Account settings
│   │   └── storage/page.tsx    # Storage settings
│   ├── shared/page.tsx         # Shared with me
│   ├── sync/page.tsx           # Sync center
│   └── api/                    # API routes
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx          # Top navbar
│   │   ├── Sidebar.tsx         # Left sidebar
│   │   ├── MobileNav.tsx       # Bottom mobile nav
│   │   └── ThemeToggle.tsx     # Theme toggle button
│   ├── providers/
│   │   ├── SessionProvider.tsx # NextAuth session wrapper
│   │   └── ThemeProvider.tsx   # next-themes wrapper
│   ├── auth/SignInButtons.tsx
│   ├── dashboard/DashboardClient.tsx
│   ├── documents/
│   │   ├── DocumentsClient.tsx
│   │   ├── DocumentDetailClient.tsx
│   │   ├── DocumentPropertiesModal.tsx
│   │   └── UploadModal.tsx
│   ├── folders/
│   │   ├── FoldersClient.tsx
│   │   ├── FolderDetailClient.tsx
│   │   ├── CreateFolderModal.tsx
│   │   └── FolderPropertiesModal.tsx
│   ├── search/SearchClient.tsx
│   ├── settings/
│   │   ├── SettingsClient.tsx
│   │   ├── StorageSettingsClient.tsx
│   │   └── SyncCenterClient.tsx
│   ├── shared/SharedClient.tsx
│   └── icons/VaultLogo.tsx
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── authz.ts                # Authorization helpers
│   ├── prisma.ts               # Prisma client
│   ├── blob.ts                 # Blob upload utilities
│   ├── gemini.ts               # Gemini AI processing
│   ├── google-drive/oauth.ts
│   ├── storage/                # Storage provider abstraction
│   └── sync/sync-engine.ts
├── middleware.ts               # Auth middleware
└── types/next-auth.d.ts
```

### Architecture Notes
- **App Router** is used exclusively. No Pages Router remnants.
- **Server Components** are used for data fetching in page files; **Client Components** (`"use client"`) are used for all interactive UI.
- There is **no shared authenticated layout** (`layout.tsx` inside a route group). Instead, each client component manually composes `Navbar + Sidebar + MobileNav`. This is a significant architectural inconsistency.
- The root `layout.tsx` only wraps with `ThemeProvider` and `SessionProvider` — it does not include any navigation or layout shell.

---

## 3. Complete Route & Page Inventory

| Route | Page/Purpose | Layout | Navigation Access | Key Components | UI Pattern | Notes |
|---|---|---|---|---|---|---|
| `/` | Landing page | None (full-screen) | Direct URL, logo link | VaultLogo, CTA buttons | Hero + feature cards | Public; redirects logged-in users to /dashboard |
| `/auth/signin` | Google sign-in | None (full-screen) | Redirect from middleware, landing page CTA | SignInButtons, VaultLogo | Centered card with Google OAuth button | Public; redirects logged-in users to /dashboard |
| `/dashboard` | Dashboard overview | Navbar + Sidebar + MobileNav | Sidebar, logo, mobile nav | DashboardClient, stat cards, recent docs, folders, shared | Card grid + stat tiles | Entry point after login |
| `/documents` | All documents list | Navbar + Sidebar + MobileNav | Sidebar, mobile nav | DocumentsClient, filter bar, upload modal | Card grid with search/filter |
| `/documents/[documentId]` | Document detail | Navbar + Sidebar + MobileNav | From document cards, search results | DocumentDetailClient, tabs (preview/summary/interpretation/text), properties modal | Tabbed detail view with breadcrumbs |
| `/folders` | Root folders list | Navbar + Sidebar + MobileNav | Sidebar, mobile nav | FoldersClient, create folder modal | Card grid |
| `/folders/[folderId]` | Folder detail | Navbar + Sidebar + MobileNav | From folder cards, breadcrumbs | FolderDetailClient, subfolder grid, document grid, properties modal | Breadcrumb nav + two-section grid |
| `/search` | Search results | Navbar + Sidebar + MobileNav | Sidebar, mobile nav, navbar search suggestions | SearchClient | Search form + result cards |
| `/settings` | Account settings | Navbar + Sidebar + MobileNav | Sidebar, profile dropdown | SettingsClient, info cards, links to sub-pages | Vertical card layout |
| `/settings/storage` | Storage settings | Navbar + Sidebar + MobileNav | From settings page | StorageSettingsClient, radio cards, connection status | Settings form with connection management |
| `/shared` | Shared with me | Navbar + Sidebar + MobileNav | Sidebar, mobile nav | SharedClient | Card grid |
| `/sync` | Sync center | Navbar + Sidebar + MobileNav | Sidebar, mobile nav | SyncCenterClient, stats, activity log | Stats cards + activity list |

### Route Analysis
- **No orphaned routes** detected.
- **No duplicated routes** detected.
- **All authenticated routes** are protected by middleware redirect.
- **`/settings` and `/settings/storage`** are nested but `/sync` lives at root level rather than under `/settings` — this is inconsistent.
- **No loading.tsx, error.tsx, not-found.tsx, or template.tsx** files exist. Next.js default error/not-found boundaries are used.
- The `notFound()` function from `next/navigation` is called in `documents/[documentId]/page.tsx` and `folders/[folderId]/page.tsx` for unauthorized access.

---

## 4. Global Layout Analysis

### Actual Layout Hierarchy

```
RootLayout (app/layout.tsx)
├── <html> (suppressHydrationWarning, className="h-full antialiased")
│   └── <body> (Inter font, bg-bg-main, text-text-primary)
│       └── ThemeProvider
│           └── SessionProvider
│               └── {children}
```

**Important**: There is **no global shell layout** (no header/sidebar in the root layout). Each authenticated page component manually composes the shell:

```
Authenticated Page (e.g., DashboardClient)
├── Navbar
├── div.flex-1.flex.overflow-hidden
│   ├── Sidebar
│   └── main (page content)
└── MobileNav
```

### Layout Components

**Navbar** (`components/layout/Navbar.tsx`):
- Sticky top header (`sticky top-0 z-30`)
- Backdrop blur + semi-transparent background (`bg-bg-surface/80 backdrop-blur-xl`)
- Contains: Logo/brand, global search input with live suggestions, theme toggle, upload button (optional), user avatar with profile dropdown
- Responsive: Logo text hidden on small screens (`hidden sm:flex`), mobile menu toggle button visible only on `md:hidden`
- Height: Not explicitly fixed; determined by `py-3` padding + content

**Sidebar** (`components/layout/Sidebar.tsx`):
- Fixed width `w-64`
- Hidden on mobile (`hidden md:flex`)
- Contains: Logo, navigation links, security info card at bottom
- Active state: `bg-accent-primary-soft text-accent-primary font-semibold` with a `ChevronRight` indicator
- Hover state: `hover:text-text-primary hover:bg-bg-muted`

**MobileNav** (`components/layout/MobileNav.tsx`):
- Fixed bottom bar (`fixed bottom-0 left-0 right-0 z-40`)
- Backdrop blur + semi-transparent
- Contains: 6 nav items (Home, Docs, Folders, Sync, Shared, Search) + floating upload FAB
- Upload FAB: `-mt-8` floating above the bar, accent-primary background with ring
- Uses `safe-area-pb` class for iOS safe area

**Page Content Area**:
- `flex-1 overflow-y-auto` — takes remaining height, scrolls independently
- Padding: `p-4 md:p-8`
- Bottom padding on mobile: `pb-24 md:pb-8` (to account for fixed mobile nav)

### Responsive Behavior
- **Desktop (≥md)**: Sidebar visible, no mobile nav, full content width
- **Mobile (<md)**: Sidebar hidden, MobileNav visible at bottom, content padding adjusted
- No tablet-specific breakpoints beyond `md` (768px)

---

## 5. Navigation Architecture

### Primary Navigation (Sidebar)
Defined in `components/layout/Sidebar.tsx`:
1. Dashboard (`/dashboard`)
2. Documents (`/documents`)
3. Shared (`/shared`)
4. Folders (`/folders`)
5. Sync (`/sync`)
6. Search (`/search`)
7. Settings (`/settings`)

### Secondary Navigation (Navbar)
- Logo → `/dashboard`
- Global search → `/search?q=...`
- Upload button → opens UploadModal (contextual)
- Profile dropdown → `/settings`, Sign Out

### Tertiary Navigation (Mobile)
- Same items as sidebar but with abbreviated labels ("Docs" instead of "Documents", no "Settings" link)
- **Note**: Mobile nav is missing "Settings" — this is an inconsistency. The sidebar has Settings but MobileNav does not.

### Contextual Navigation
- Breadcrumbs on document detail and folder detail pages
- "View all" links from dashboard sections to dedicated pages
- Card links to detail pages

### Navigation Consistency Issues
| Issue | Severity | Location |
|---|---|---|
| Mobile nav missing "Settings" link | HIGH | `MobileNav.tsx` — sidebar has it, mobile nav does not |
| Sidebar active state uses `startsWith` for all routes except `/dashboard` | MEDIUM | `Sidebar.tsx:40` — inconsistent active logic |
| Navbar search suggestions link to `/documents/[id]` but search page uses different card layout | LOW | `Navbar.tsx` vs `SearchClient.tsx` |
| Profile dropdown "Account Settings" links to `/settings` | OK | Consistent |

---

## 6. Navigation Tree

```
Application
├── Landing Page (/)
│   ├── Go to Vault → /dashboard (if logged in)
│   └── Sign In → /auth/signin
│
├── Auth (/auth/signin)
│   └── Continue with Google → /dashboard
│
├── Dashboard (/dashboard)
│   ├── Upload Document → UploadModal
│   ├── New Folder → CreateFolderModal
│   ├── Recent Documents → /documents/[id]
│   ├── My Folders → /folders/[id]
│   ├── Shared With Me → /shared
│   └── View all documents → /documents
│
├── Documents (/documents)
│   ├── Upload → UploadModal
│   ├── Filter by folder
│   ├── Search by name/tag
│   └── Document Card → /documents/[id]
│       ├── Preview tab (PDF iframe / Image / Unavailable)
│       ├── Summary tab (Markdown)
│       ├── Interpretation tab (Markdown)
│       ├── Text tab (Raw OCR)
│       ├── Download
│       ├── Open in Drive (if Google Drive)
│       └── Properties → DocumentPropertiesModal
│           ├── Rename / Move / Re-tag
│           ├── Retry AI
│           └── Delete (with confirmation)
│
├── Folders (/folders)
│   ├── Create Folder → CreateFolderModal
│   ├── Upload → UploadModal
│   └── Folder Card → /folders/[id]
│       ├── Subfolders → /folders/[id] (nested)
│       ├── Documents in folder → /documents/[id]
│       ├── New Subfolder → CreateFolderModal
│       ├── Upload File → UploadModal
│       └── Properties → FolderPropertiesModal
│           ├── General tab (rename, info, delete)
│           └── Sharing tab (search users, share, revoke)
│
├── Search (/search)
│   └── Results → /documents/[id]
│
├── Settings (/settings)
│   ├── Storage Settings → /settings/storage
│   └── Account info (read-only)
│
├── Storage (/settings/storage)
│   ├── Default provider selection
│   ├── Google Drive connect/disconnect/sync
│   └── Drive link → external Google Drive
│
├── Shared (/shared)
│   └── Shared Folder → /folders/[id] (read-only)
│
└── Sync (/sync)
    ├── Sync Now → POST /api/integrations/google-drive/sync
    ├── Storage Settings → /settings/storage
    └── Activity log (read-only)
```

### Orphan / Hidden / Inconsistent Routes
- `/sync` is logically related to settings/storage but lives at root level. It is accessible via sidebar.
- `/settings/storage` is nested but `/sync` is not — inconsistent nesting.
- No route exists for user profile editing (only display). Settings page shows identity but has no edit form.

---

## 7. Design System

The application uses a **custom CSS variable-based design system** defined in `globals.css`, with Tailwind CSS v4's `@theme` directive mapping custom property names to Tailwind utility classes. There are no external design tokens (no Figma tokens, no `tokens.css`, no design token JSON files).

### Design System Architecture
- **Colors**: 18 CSS custom properties (9 light + 9 dark)
- **No centralized spacing, typography, border-radius, shadow, or breakpoint tokens**
- **Custom component classes**: `.vault-card`, `.vault-card-hover`, `.vault-input`, `.vault-btn-primary`, `.vault-btn-secondary`, `.glass-panel`
- **No animation library** — animations use Tailwind's built-in `animate-spin` and CSS transitions
- **No component library** — all components are hand-built

### Design Principles Observed
1. **Card-based layout**: Almost all content is organized in cards with consistent borders and backgrounds
2. **Rounded corners**: Heavy use of `rounded-2xl` (16px) and `rounded-3xl` (24px)
3. **Soft shadows**: Subtle shadows on hover, stronger shadows on modals
4. **Icon-forward**: Every section, card, and action uses lucide-react icons
5. **Gradient accents**: Primary buttons use a linear gradient from indigo to indigo-hover
6. **Backdrop blur**: Navbar, MobileNav, modals, and landing page overlays use `backdrop-blur`

---

## 8. Color System

### Light Mode (CSS Variables in `globals.css:25-44`)

| Token | Value | Tailwind Class | Usage |
|---|---|---|---|
| `--bg-main` | `#fafafa` | `bg-bg-main` | Page background |
| `--bg-surface` | `#ffffff` | `bg-bg-surface` | Cards, modals, navbar, sidebar |
| `--bg-muted` | `#f4f4f5` | `bg-bg-muted` | Secondary backgrounds, hover states |
| `--border-subtle` | `#e4e4e7` | `border-border-subtle` | Card borders, subtle dividers |
| `--border-default` | `#d4d4d8` | `border-border-default` | Hover borders, default borders |
| `--text-primary` | `#18181b` | `text-text-primary` | Headings, primary text |
| `--text-secondary` | `#3f3f46` | `text-text-secondary` | Body text, descriptions |
| `--text-muted` | `#71717a` | `text-text-muted` | Placeholders, captions, secondary info |
| `--accent-primary` | `#4f46e5` | `text-accent-primary` / `bg-accent-primary-soft` | Primary actions, links, active states |
| `--accent-primary-hover` | `#4338ca` | `hover:bg-accent-primary-hover` | Primary button hover |
| `--accent-primary-soft` | `rgba(79,70,229,0.08)` | `bg-accent-primary-soft` | Primary tinted backgrounds |
| `--accent-primary-ring` | `rgba(79,70,229,0.25)` | `ring-accent-primary` / focus rings | Focus indicators |
| `--accent-secondary` | `#f59e0b` | `text-accent-secondary` / `bg-accent-secondary-soft` | AI processing, warnings |
| `--accent-secondary-soft` | `rgba(245,158,11,0.1)` | `bg-accent-secondary-soft` | Secondary tinted backgrounds |
| `--accent-emerald` | `#10b981` | `text-accent-emerald` / `bg-accent-emerald-soft` | Success states, shared indicators |
| `--accent-emerald-soft` | `rgba(16,185,129,0.1)` | `bg-accent-emerald-soft` | Success tinted backgrounds |
| `--accent-rose` | `#f43f5e` | `text-accent-rose` / `bg-accent-rose-soft` | Error states, destructive actions |
| `--accent-rose-soft` | `rgba(244,63,94,0.1)` | `bg-accent-rose-soft` | Error tinted backgrounds |

### Dark Mode (`globals.css:46-65`)

| Token | Value |
|---|---|
| `--bg-main` | `#09090b` |
| `--bg-surface` | `#18181b` |
| `--bg-muted` | `#27272a` |
| `--border-subtle` | `#27272a` |
| `--border-default` | `#3f3f46` |
| `--text-primary` | `#fafafa` |
| `--text-secondary` | `#d4d4d8` |
| `--text-muted` | `#a1a1aa` |
| `--accent-primary` | `#818cf8` |
| `--accent-primary-hover` | `#6366f1` |
| `--accent-primary-soft` | `rgba(129,140,248,0.12)` |
| `--accent-primary-ring` | `rgba(129,140,248,0.35)` |

### Color Usage Patterns
- **Primary actions**: `accent-primary` (indigo) with soft tinted backgrounds
- **Success states**: `accent-emerald` with soft backgrounds
- **Warning/AI**: `accent-secondary` (amber) with soft backgrounds
- **Error/Destructive**: `accent-rose` (rose) with soft backgrounds
- **Backgrounds**: Zinc-based grays (`bg-main`, `bg-surface`, `bg-muted`) providing neutral canvas
- **Borders**: Zinc-based subtle borders (`border-subtle`, `border-default`)

### Color Inconsistencies
- Some components use hardcoded colors instead of CSS variables (e.g., Google logo SVG paths in `SignInButtons.tsx`)
- The logo gradient uses hardcoded `#6366f1` and `#8b5cf6` instead of theme tokens
- No semantic color tokens for `info` — only success, warning, error are defined

---

## 9. Typography System

### Font Configuration
- **Primary font**: `Inter` from `next/font/google` with `subsets: ["latin"]` and `display: "swap"`
- **Font feature settings**: `cv02`, `cv03`, `cv04`, `cv11` (OpenType features for numerals and punctuation)
- **No other font families** are imported or configured

### Typography Patterns (observed from code)
| Element | Size/Weight/Style | Tailwind Classes |
|---|---|---|
| Page title (h1) | 2xl / bold / tracking-tight | `text-2xl font-bold tracking-tight` |
| Hero h1 | 5xl-7xl / extrabold / tracking-tight / leading-[1.08] | `text-5xl md:text-7xl font-extrabold tracking-tight` |
| Section title (h2) | lg / bold | `text-lg font-bold` |
| Card title (h3) | base / semibold | `text-base font-semibold` |
| Body text | sm / font-light | `text-sm font-light` |
| Secondary text | sm | `text-text-secondary text-sm` |
| Muted text | xs / font-medium | `text-xs text-text-muted font-medium` |
| Button text | sm / font-semibold | `text-sm font-semibold` |
| Nav item text | sm / font-medium | `text-sm font-medium` |
| Mobile nav text | 11px / font-medium | `text-[11px] font-medium` |
| Badge text | 10px / font-medium | `text-[10px] font-medium` |
| Stat number | 2xl / bold | `text-2xl font-bold` |
| Footer text | xs / font-medium | `text-xs font-medium` |
| Serif italic (landing) | font-serif font-normal italic | `italic font-serif font-normal` |

### Typography Scale
The application does **not** use a centralized typography scale. Font sizes are hardcoded throughout:
- `text-xs` (12px)
- `text-sm` (14px)
- `text-base` (16px)
- `text-lg` (18px)
- `text-xl` (20px)
- `text-2xl` (24px)
- `text-5xl` (48px)
- `text-7xl` (72px)
- Custom: `text-[9px]`, `text-[10px]`, `text-[11px]`

### Typography Inconsistencies
- Heading sizes vary between pages: `text-2xl` on dashboard vs `text-5xl md:text-7xl` on landing
- Font weights mix `font-bold`, `font-extrabold`, `font-semibold`, `font-medium` for similar hierarchy levels
- No centralized typography scale — values are hardcoded throughout
- Landing page uses `font-serif` for emphasis, but no other page uses serif fonts
- Line heights are mostly default (`leading-normal`) except for the landing hero (`leading-[1.08]`)

---

## 10. Spacing & Sizing System

### Observed Spacing Patterns
| Context | Value | Tailwind Class |
|---|---|---|
| Page padding (mobile) | 16px | `p-4` |
| Page padding (desktop) | 32px | `md:p-8` |
| Card padding | 20-32px | `p-4`, `p-5`, `p-6`, `p-8` |
| Card border radius | 16px-24px | `rounded-2xl`, `rounded-3xl` |
| Button border radius | 12px | `rounded-xl` |
| Input border radius | 12px | `rounded-xl` |
| Icon container radius | 16px-24px | `rounded-2xl` |
| Grid gap | 16px-32px | `gap-4`, `gap-6`, `gap-8` |
| Section spacing | 24px-32px | `space-y-6`, `space-y-8` |
| Nav item padding | 10px 14px | `px-3.5 py-2.5` |
| Sidebar width | 256px | `w-64` |
| Navbar height | ~56px | `py-3` + content |
| Mobile nav height | ~64px + FAB | `py-2` + content |

### Spacing Scale
The application uses Tailwind's default spacing scale but applies it inconsistently:
- **4px** (`gap-1`, `p-1`): Icon-only buttons, tight gaps
- **8px** (`gap-2`, `p-2`): Button padding, small gaps
- **12px** (`gap-3`, `p-3`): Medium gaps, icon containers
- **16px** (`gap-4`, `p-4`): Card padding, page padding mobile, grid gaps
- **20px** (`p-5`): Card padding (non-standard)
- **24px** (`gap-6`, `p-6`, `space-y-6`): Card padding, section spacing, grid gaps
- **32px** (`gap-8`, `p-8`, `md:p-8`): Page padding desktop, large grid gaps

### Spacing Inconsistencies
- Card padding varies: `p-4`, `p-5`, `p-6`, `p-8`, `p-12` used interchangeably for similar card types
- Border radius varies: `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-3xl` (24px) used for similar components
- No centralized spacing scale — all values are ad-hoc Tailwind classes
- `p-5` (20px) is not part of Tailwind's default scale and appears inconsistently

---

## 11. Component Inventory

### Layout Components
| Component | Location | Purpose | Variants | Responsive |
|---|---|---|---|---|
| `Navbar` | `components/layout/Navbar.tsx` | Top app bar | With/without upload button | Logo hidden on mobile |
| `Sidebar` | `components/layout/Sidebar.tsx` | Left navigation | Desktop only | `hidden md:flex` |
| `MobileNav` | `components/layout/MobileNav.tsx` | Bottom mobile nav | With/without upload FAB | `md:hidden` |
| `ThemeToggle` | `components/layout/ThemeToggle.tsx` | Dark/light toggle | Mounted/unmounted state | No responsive |
| `VaultLogo` | `components/icons/VaultLogo.tsx` | SVG logo | Size parameter | No responsive |
| `VaultLogoMark` | `components/icons/VaultLogo.tsx` | Outlined logo variant | Size parameter | No responsive |
| `VaultWordmark` | `components/icons/VaultLogo.tsx` | Text logo | Size parameter | No responsive |

### Navigation Components
| Component | Location | Purpose |
|---|---|---|
| Sidebar nav items | `Sidebar.tsx` | Primary nav links with icons |
| Profile dropdown | `Navbar.tsx` | User menu with settings/sign-out |
| Search suggestions | `Navbar.tsx` | Live search dropdown |
| Breadcrumbs | `DocumentDetailClient.tsx`, `FolderDetailClient.tsx` | Contextual navigation |

### Form Components
| Component | Location | Purpose | Styling |
|---|---|---|---|
| Text input | Multiple (UploadModal, etc.) | Text fields | `vault-input` class |
| Select | DocumentsClient, UploadModal | Folder select | `vault-input` class |
| Checkbox | UploadModal | AI generation toggle | Native checkbox with `accent-accent-primary` |
| Radio | StorageSettingsClient | Storage provider selection | Native radio with `sr-only` |
| File input | UploadModal | Document upload | Custom styled dropzone |

### Content Components
| Component | Location | Purpose | Styling |
|---|---|---|---|
| Card | Multiple (inline) | Content containers | `vault-card` class |
| Card (hoverable) | Multiple (inline) | Clickable cards | `vault-card vault-card-hover` |
| Badge | Multiple (inline) | Status indicators | Inline flex + colored backgrounds |
| Stat tile | DashboardClient | Statistics display | `vault-card` + icon + number |
| Empty state | Multiple (inline) | No data states | Centered icon + text + optional CTA |
| Table | Not present | — | — |
| List | SyncCenterClient | Activity feed | Vertical card list |

### Feedback Components
| Component | Location | Purpose |
|---|---|---|
| Modal | UploadModal, DocumentPropertiesModal, FolderPropertiesModal, CreateFolderModal | Dialogs |
| Alert (inline) | Multiple | Success/error messages |
| Loading spinner | Multiple | `Loader2` icon with `animate-spin` |
| Toast | Not present | — |
| Skeleton | Not present | — |
| Tooltip | Not present | — |

### Action Components
| Component | Location | Purpose |
|---|---|---|
| Primary button | Inline (`vault-btn-primary`) | Main CTAs |
| Secondary button | Inline (`vault-btn-secondary`) | Secondary actions |
| Icon button | Navbar, modals | Settings, close, etc. |
| Link | Multiple | Navigation |
| FAB | MobileNav | Mobile upload action |

---

## 12. Component Duplication

| Component/Pattern | Locations | Differences | Likely Same Concept? |
|---|---|---|---|
| **Page shell (Navbar + Sidebar + MobileNav)** | DashboardClient, DocumentsClient, DocumentDetailClient, FoldersClient, FolderDetailClient, SearchClient, SettingsClient, SyncCenterClient, SharedClient, StorageSettingsClient | All repeat identical `Navbar + Sidebar + main + MobileNav` structure | YES — should be a shared layout wrapper |
| **Empty state** | DashboardClient (3 variants), DocumentsClient, FoldersClient, FolderDetailClient, SharedClient, SearchClient | Slightly different icon, text, and CTA styling | YES — should be a shared EmptyState component |
| **Document card** | DashboardClient (recent docs), DocumentsClient, FolderDetailClient, SearchClient | Minor differences in metadata display, badges, tags | YES — same card concept with slight variations |
| **Folder card** | DashboardClient (my folders + shared), FoldersClient, SharedClient | Color variations (primary vs emerald), share badge differences | YES — same card concept |
| **Stat tile** | DashboardClient | Icon + label + number pattern | YES — only used in one place but could be reusable |
| **Modal** | UploadModal, DocumentPropertiesModal, FolderPropertiesModal, CreateFolderModal | Different content but identical shell (overlay, close button, header, body) | YES — should share a Modal primitive |
| **AI status badge** | DashboardClient, DocumentsClient, FolderDetailClient | Same COMPLETED/PROCESSING/FAILED badge pattern | YES — duplicated inline |
| **Page header** | Each client component | Title + icon + description pattern | YES — consistent but not abstracted |
| **Tag/badge** | DocumentsClient, DocumentDetailClient, FolderDetailClient, SearchClient | Same inline pill style | YES — duplicated |
| **Success/error alert** | SyncCenterClient, StorageSettingsClient, DocumentPropertiesModal, FolderPropertiesModal | Same colored alert pattern | YES — duplicated |
| **Delete confirmation** | DocumentPropertiesModal, FolderPropertiesModal | Same two-step confirmation pattern | YES — duplicated |

---

## 13. Page-Level UI Patterns

### Dashboard Pattern
- Welcome header with user name
- Action buttons (New Folder, Upload)
- Stat cards row (3 columns)
- Section headers with "View all" links
- Card grids (documents, folders, shared)

### List Page Pattern (Documents, Folders, Shared)
- Page header with icon + title + description
- Action button(s) in header
- Filter/search bar (Documents only)
- Empty state or card grid
- Bottom padding for mobile nav

### Detail Page Pattern (Document, Folder)
- Breadcrumb navigation
- Header card with icon, title, metadata, actions
- Status indicators (AI processing, shared badge)
- Tabbed content (Document only)
- Content sections (subfolders, documents)
- Modals for properties/actions

### Settings Page Pattern
- Page header with icon + title
- Vertical stack of `vault-card` sections
- Internal navigation via links
- No data table

### Modal Pattern
- Fixed overlay with backdrop blur
- Centered card (`max-w-lg` or `max-w-md`)
- Header with icon, title, close button
- Scrollable body
- Footer with action buttons

### Empty State Pattern
- Centered large icon (text-muted)
- Heading text
- Description text
- Optional CTA button

---

## 14. Responsive Design

### Breakpoints
- Only `md` (768px) is used as a breakpoint
- No `sm`, `lg`, `xl` specific breakpoints beyond Tailwind defaults

### Responsive Patterns
| Element | Desktop | Mobile |
|---|---|---|
| Sidebar | Visible (`w-64`) | Hidden |
| MobileNav | Hidden | Visible (fixed bottom) |
| Logo text | Visible | Hidden (icon only) |
| Page padding | `p-8` (32px) | `p-4` (16px) |
| Content bottom padding | `pb-8` | `pb-24` (for mobile nav) |
| Card grids | 4 columns | 1 column |
| Dashboard stats | 3 columns | 1 column |
| Document grids | 4 columns | 1 column |
| Folder grids | 4 columns | 2 columns |
| Search input | Full width with suggestions | Full width |
| Header actions | Horizontal | Stacked/condensed |
| Upload button | In navbar | FAB on mobile nav |

### Responsive Inconsistencies
- Mobile nav is missing "Settings" link (only 6 items vs sidebar's 7)
- No tablet-specific optimization between mobile and desktop
- Some grids use `sm:` breakpoints inconsistently

---

## 15. Theme / Dark Mode

### Theme System
- **Provider**: `next-themes` with `attribute="class"`
- **Default**: `system` theme
- **Toggle**: Button in Navbar (`ThemeToggle.tsx`)
- **CSS**: CSS custom properties switch between light/dark values via `.dark` class

### Dark Mode Classes
- `dark .vault-card-hover:hover` — different shadow in dark mode
- `dark:bg-bg-surface/80` — used on MobileNav and Navbar
- `dark:prose-invert` — used on markdown content in document detail

### Theme Implementation Details
The theme system works by:
1. `ThemeProvider` wraps the app with `next-themes` using `attribute="class"`
2. When theme changes, a `dark` class is added to `<html>`
3. CSS custom properties switch values under `.dark` selector
4. `suppressHydrationWarning` prevents hydration mismatches
5. All transitions are handled by the global CSS transition rules

### Theme Inconsistencies
- `html` has `transition` on background-color and color, but `html *` also has transitions — this causes all elements to animate on theme change, which can be janky
- Some components use `dark:` prefix classes (Navbar, MobileNav) but most rely on CSS variables only
- The `glass-panel` class exists in CSS but is **never used** in any component
- No `prefers-color-scheme` media query fallback beyond `next-themes` system default

---

*End of sections 1–15. Remaining sections (16–25) will be added in subsequent updates.*

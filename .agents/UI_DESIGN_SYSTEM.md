# Vaulty — UI Design System & Patterns

Vaulty uses an **Obsidian Atelier** (dark default) / **Warm Alabaster** (light) archival aesthetic built with Tailwind CSS v4 (`src/app/globals.css`).

---

## Color & Theme Tokens (`src/app/globals.css`)

### Dark Theme (`html.dark` — Default)

- `--background`: `#0b0e14` | `--surface`: `#12161f` | `--surface-elevated`: `#171d29` | `--surface-muted`: `#1b2230`
- `--foreground` / `--text-primary`: `#f2f0eb` | `--text-secondary`: `#c5c9d3` | `--text-muted`: `#8a92a3`
- `--brand`: `#5b87ff` | `--brand-hover`: `#799eff` | `--brand-subtle`: `rgba(91, 135, 255, 0.14)`
- `--border`: `rgba(242, 240, 235, 0.12)` | `--border-subtle`: `rgba(242, 240, 235, 0.07)`
- Semantic statuses: `--success` (`#10b981`), `--warning` (`#f59e0b`), `--danger` (`#fb7185`), `--info` (`#38bdf8`)

### Light Theme (Warm Alabaster & Ink)

- `--background`: `#f6f5f0` | `--surface`: `#ffffff` | `--surface-muted`: `#eeece5`
- `--foreground` / `--text-primary`: `#12161f` | `--text-secondary`: `#434b59` | `--text-muted`: `#666e7d`
- `--brand`: `#1f48cb` (Archival Cobalt) | `--brand-hover`: `#1839a8` | `--brand-subtle`: `#eef3ff`
- `--border`: `#d8d4c8` | `--border-subtle`: `#e7e4db`

---

## Typography (`src/app/layout.tsx`)

| Role                       | Font Variable  | Face                |
| :------------------------- | :------------- | :------------------ |
| UI & Controls              | `--font-sans`  | `Plus Jakarta Sans` |
| Editorial / Serif Headings | `--font-serif` | `Newsreader`        |
| Ciphers, Codes, Telemetry  | `--font-mono`  | `JetBrains Mono`    |

---

## Layout, Navigation & Shell Components

- **`Navbar`** (`src/components/shell/Navbar.tsx`): Brand logo & wordmark, global search trigger (`Cmd+K`), App Lock toggle, Notifications bell, Theme switcher, User avatar menu.
- **`Sidebar`** (`src/components/shell/Sidebar.tsx`): Ordered explicitly as **Your Space** (`Dashboard`, `Documents`, `Wealth`, `Credentials`, `Reminders`, `Notes`) followed by **AI & Sharing** (`AI Chat`, `Email Sync`, `Family`), paired with a consistent left-and-right **AppFooter** / **SiteFooter**.
- **`PageHeader`** (`src/components/shell/PageHeader.tsx`): Clean title without unnecessary taglines, static/dynamic route breadcrumbs (`Breadcrumbs.tsx`), and optional action controls.
- **Dashboard Grid** (`DashboardOverviewClient.tsx`): Responsive Bento layout capped at **3 cards per row on desktop** (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), displaying uniform-width cards for Documents, Wealth, Credentials (with 2FA authenticator stats & `Manage credentials` link), and Reminders.

---

## Core UI Primitives (`src/components/ui/`)

| Component                   | Behavior & Rules                                                                                                                                                                                              |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`Button` / `IconButton`** | Variants `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`, `lg`. Keep **at most one solid `primary` button** per section/header to preserve clear visual hierarchy.                                |
| **`Modal`**                 | Portal-rendered native `<dialog>` using `showModal()` top-layer rendering, `transition-behavior: allow-discrete` exit animation detection (`data-closing` fallback), Escape & backdrop light-dismiss support. |
| **`CommandBar`**            | Rounded toolbar (`CommandBar.tsx`) styling search, sort, filters, view toggles, and contextual actions (such as `Edit`) cohesively without jarring sharp-button mismatches.                                   |
| **`FolderTreeSelect`**      | Hierarchical collapsible tree picker for folder destinations (`Documents`, `Folders`, `UploadModal`, `CameraScanModal`).                                                                                      |
| **`StatCard` & `Card`**     | Uniform surface cards with crisp hairline borders, subtle hover elevation on navigable document/folder items, and zero noisy metadata pills.                                                                  |
| **`Skeleton`**              | Route-level `loading.tsx` skeletons under every `src/app/(app)/**/loading.tsx` matching `PageHeader` breadcrumbs (`Skeleton` strip above header + page content structure).                                    |
| **`Vault3DShowcase`**       | Interactive 4-scene CSS 3D product animation on the public landing page (`src/components/landing/Vault3DShowcase.tsx` + keyframes in `globals.css`) with `@media (prefers-reduced-motion: reduce)` fallbacks. |

---

## Accessibility & Interaction Rules

- Interactive non-button cards or rows must provide keyboard operability (`tabIndex={0}`, `Enter`/`Space` handlers) or use real `<Link>`/`<button>` elements.
- Respect `prefers-reduced-motion` across all 3D transforms, progress rings, and modal transitions.
- Never suppress dark/light contrast pairs: test custom colors against both `#0b0e14` and `#f6f5f0` surfaces.

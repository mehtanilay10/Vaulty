# UI & Design System Guide

> **Scope:** Comprehensive reference for Vaulty's visual design system, UI primitives, interaction patterns, typography, spacing cadence, and component standards.

---

## 1. Visual Philosophy & Design Language

Vaulty's visual design is inspired by modern productivity software and personal vaults (such as Microsoft 365, Fluent 2, and linear productivity tools). It is characterized by:

- **Calm, Crisp Neutral Surfaces:** Soft background surfaces with subtle borders (`border-border-subtle`) and low-diffusion elevation shadows (`shadow-fluent-*`).
- **Domain-Specific Color Signposts:**
  - **Documents:** Cobalt Sapphire (`#2557e0` / `var(--brand)`)
  - **Credentials & Passwords:** Royal Amethyst (`#7C3AED` / `text-purple-600`)
  - **Wealth & Finance:** Forest Emerald (`#059669` / `text-emerald-600`)
  - **Reminders & Expiries:** Warm Amber (`#D97706` / `text-amber-600`)
  - **Family Sharing:** Coral Rose (`#E11D48` / `text-rose-600`)
  - **AI Intelligence:** Steel Cyan (`#0891B2` / `text-cyan-600`)
- **No Decorative Excess:** No floating action buttons (FABs), no noisy background mesh gradients, and no generic purple glow borders.

---

## 2. Design Tokens & Semantic Variables

All semantic tokens are defined in `src/app/globals.css` and exposed as Tailwind CSS v4 variables:

### Colors & Surfaces

| Token                | Light Mode Value | Dark Mode Value | Usage                                           |
| :------------------- | :--------------- | :-------------- | :---------------------------------------------- |
| `--background`       | `#f8f9fb`        | `#090d16`       | Page root background                            |
| `--surface`          | `#ffffff`        | `#101726`       | Standard cards, command bars, dropdown triggers |
| `--surface-elevated` | `#ffffff`        | `#161f33`       | Modals, popovers, blades, tooltips              |
| `--surface-muted`    | `#f1f4f8`        | `#1a243b`       | Table headers, code blocks, active items        |
| `--border`           | `#dbe1eb`        | `#22304d`       | Inputs, card dividers                           |
| `--border-subtle`    | `#ebedf2`        | `#1d2840`       | Table grid lines, subtle component borders      |
| `--text-primary`     | `#0f172a`        | `#f8fafc`       | Headings, primary content, table values         |
| `--text-secondary`   | `#475569`        | `#94a3b8`       | Labels, descriptions, secondary items           |
| `--text-muted`       | `#64748b`        | `#64748b`       | Timestamps, helper text, empty state icons      |
| `--brand`            | `#2557e0`        | `#3b82f6`       | Primary actions, active highlights, icons       |
| `--brand-hover`      | `#1e44c8`        | `#2563eb`       | Primary button hover state                      |
| `--brand-subtle`     | `#eff4ff`        | `#1e293b`       | Badges, selected item backgrounds               |
| `--danger`           | `#e11d48`        | `#f43f5e`       | Destructive actions, error alerts, expiries     |
| `--warning`          | `#d97706`        | `#f59e0b`       | Warning alerts, due soon badges                 |
| `--success`          | `#059669`        | `#10b981`       | Success alerts, positive balance delta          |

### Elevations & Shadows

- `--shadow-fluent-2`: Subtle card elevation (`0 1px 3px rgba(0, 0, 0, 0.04)`).
- `--shadow-fluent-4`: Interactive hover card elevation (`0 4px 6px -1px rgba(0, 0, 0, 0.06)`).
- `--shadow-fluent-8`: Flyouts and command bar dropdowns (`0 10px 15px -3px rgba(0, 0, 0, 0.07)`).
- `--shadow-fluent-16`: Modals, dialogs, and popovers (`0 20px 25px -5px rgba(0, 0, 0, 0.08)`).
- `--shadow-fluent-64`: App Lock screen and lightbox overlays.

---

## 3. Core Component Standards

### CommandBar (`src/components/ui/CommandBar.tsx`)

A standardized horizontal action bar inspired by Microsoft Fluent UI:

- **Button Styling:** All buttons inside command bars use `rounded-none` (flush, square edges) with a clean height of 32px (`h-8`).
- **Hover Feedback:** Buttons feature prominent hover feedback (`hover:bg-surface-muted hover:text-text-primary active:bg-surface-muted/90`).
- **Hierarchy:**
  - One solid `primary` button per bar (white text/icon, `--brand` background).
  - Standard secondary items for navigation or secondary actions.
  - Optional `farItems` container for view toggles (grid vs list), filters, or sorting controls.

```tsx
<CommandBar
  farItems={
    <div className="flex items-center gap-1">
      <button onClick={() => setView("grid")} className="h-7 w-7 rounded-none ...">
        <LayoutGrid className="h-3.5 w-3.5" />
      </button>
    </div>
  }
>
  <CommandBarButton primary icon={<Upload />} onClick={openUpload}>
    Upload
  </CommandBarButton>
  <CommandBarButton icon={<Scan />} onClick={openCamera}>
    Scan
  </CommandBarButton>
  <CommandBarDivider />
  <CommandBarButton
    icon={<ArrowLeft />}
    item={{ key: "back", label: "Back", href: "/documents" }}
  />
</CommandBar>
```

---

### FolderTreeSelect (`src/components/ui/FolderTreeSelect.tsx`)

An interactive, accessible hierarchical tree picker component:

- **Trigger Button:** Displays a folder icon, full breadcrumb path of the selected folder (e.g. `Medical / Lab Reports`), and a chevron indicator.
- **Dropdown Surface:**
  - Floating popover with `z-[100]`, border, and `shadow-fluent-16`.
  - Instant quick-search filter at the top (displayed when more than 5 folders exist). Matches are highlighted and parent branches auto-expanded.
  - Collapsible/expandable nodes with `ChevronRight` / `ChevronDown` icons.
  - Vertical tree guide lines (`border-l border-border-subtle/70`) denoting nesting depth.
  - Folder icons: `FolderOpen` for expanded nodes, `Folder` for collapsed nodes.
  - Subfolder count badge on parent folders.
  - Checkmark indicator on currently selected folder.
  - Optional root/all folder option (`allOptionLabel="All folders"` or `rootOptionLabel="Root folder"`).

---

### NoteEditor & Preview Canvas (`src/components/notes/`)

A tri-mode personal notebook editor:

- **Rich Text Mode:** Powered by TipTap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-task-item`, `@tiptap/extension-task-list`).
- **Markdown Mode:** Direct raw Markdown editing with a monospaced font, automatic indentation handling, and format keyboard shortcuts (`Ctrl+B`, `Ctrl+I`, etc.).
- **Preview Mode:** Rendered GitHub Flavored Markdown view (`NoteMarkdown`) powered by `react-markdown` and `remark-gfm`.
  - Supports `data:image/*` and `blob:*` URIs via custom `urlTransform`, ensuring pasted screenshots and uploaded images render without being blocked.
- **Lists & To-Dos:**
  - Restored list markers: explicit `list-style-type: disc`, `decimal`, and nested markers.
  - Inline task items: strict `display: flex !important; flex-direction: row !important; align-items: flex-start !important;` with normalized paragraph margins, ensuring checkboxes never wrap to previous or next lines.

---

### Notification Center (`src/components/shell/NotificationsBell.tsx`)

- **Loading State Guard:** Protected with `hasLoaded` state to eliminate flashes of empty space before data resolves.
- **Skeleton:** Multi-row pulse skeleton with icon placeholders and dual-line text bars using high-contrast tokens (`bg-border-subtle`).
- **Empty State:** Illustrated empty bell state with helpful context.

---

## 4. Spacing, Padding & Layout Cadence

- **App Shell Page Padding:**
  - Small screens: `px-3.5 py-4`
  - Medium screens: `sm:px-5 md:py-5`
  - Large screens: `lg:px-7`
- **Vertical Section Spacing:**
  - `space-y-4 sm:space-y-5` between major page blocks.
- **Card Internal Padding:**
  - Standard cards: `p-4 sm:p-5`
  - Compact stat cards: `p-3.5 sm:p-4`
  - Toolbars: `p-3`

---

## 5. Accessibility & Keyboard Support

- **Interactive Elements:** Explicit `role="button"` or native `<button>`, with `tabIndex={0}` and Enter/Space event handlers.
- **Popovers & Menus:** ARIA attributes (`aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`), focus trapping, and Escape key listeners.
- **Forms & Inputs:** Visible labels (`<Label>`), clear focus rings (`focus-visible:ring-2 focus-visible:ring-brand-ring`), and descriptive error alerts.
- **Contrast:** Minimum 4.5:1 text-to-background contrast ratio for all standard body copy in both light and dark themes.

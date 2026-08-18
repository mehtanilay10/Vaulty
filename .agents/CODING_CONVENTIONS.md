# Vaulty — Coding Conventions

## Naming

- **Components**: PascalCase (`DashboardClient.tsx`, `UploadModal.tsx`).
- **Utilities / libs**: camelCase (`authz.ts`, `prisma.ts`, `useGoogleDriveStatus.ts`).
- **Hooks**: camelCase with `use` prefix (`useGoogleDriveStatus`).
- **Variables / functions**: camelCase.
- **Constants**: UPPER_SNAKE_CASE for module-level constants (e.g., `ALLOWED_MIME_TYPES` in `blob.ts`).
- **Prisma models**: PascalCase (`User`, `Folder`, `Document`).
- **Database fields**: camelCase (`ownerId`, `storageProvider`).

## File Organization

- **Pages**: `src/app/<route>/page.tsx` (Server Component by convention).
- **Client pages**: `src/app/<route>/**/*Client.tsx` (explicit `"use client"`).
- **Components**: Grouped by feature under `src/components/<feature>/`.
- **Shared UI**: `src/components/ui/` (Button, Card, Modal, Badge, Input, etc.).
- **Layout shell**: `src/components/shell/` (AppShell, Navbar, Sidebar, MobileNav, PageHeader).
- **Server logic**: `src/lib/<domain>/` (authz, gemini, storage, google-drive, sync).
- **Hooks**: `src/hooks/`.
- **Types**: `src/types/`.

## Component Structure

- Client Components start with `"use client"`.
- Server Components do not have the directive.
- Feature components (e.g., `DashboardClient`) receive data as props and compose UI from `shell/`, `ui/`, and feature components.
- Layout shell (`AppShell`) wraps authenticated pages and provides `Navbar` + `Sidebar` + `MobileNav`.

Example pattern:
```tsx
// Server page (page.tsx)
export default async function Page() {
  const session = await auth();
  const data = await prisma.xxx.findMany(...);
  return <ClientComponent data={JSON.parse(JSON.stringify(data))} />;
}

// Client component (*Client.tsx)
"use client";
export function ClientComponent({ data }) {
  return <AppShell>...</AppShell>;
}
```

## Props

- Prefer explicit prop types over `any`. (Note: some existing components use `any` due to serialization constraints; avoid expanding this pattern.)
- Use destructuring with defaults for optional props.
- Example:
  ```tsx
  interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
  }
  ```

## TypeScript

- **Strict mode** is enabled in `tsconfig.json`.
- **Path alias**: `@/*` maps to `./src/*`.
- Use interfaces for object shapes that may be reused; use `type` for unions, intersections, and aliases.
- Avoid `any` where possible. Existing code serializes Prisma results with `JSON.parse(JSON.stringify())` before passing to Client Components because Prisma types are not serializable.

## Interfaces / Types

- Define interfaces in the component file or in `src/types/` if shared.
- Existing authz interfaces are in `src/lib/authz.ts`.
- Existing storage interfaces are in `src/lib/storage/provider.ts`.

## Hooks

- Client hooks live in `src/hooks/`.
- Return plain objects or values, not component state setters where avoidable.
- Example: `useGoogleDriveStatus` returns `{ isConnected, loading }`.

## Async Code

- Server Components can use `async/await` directly.
- API routes use `async function GET/POST/etc`.
- Client Components must not use `async` directly in the component body; extract async logic into event handlers or `useEffect`.
- For fire-and-forget background work (e.g., AI processing), use an IIFE inside the API route handler.

## Error Handling

- **API routes**: `try/catch` around logic. Log with `console.error`. Return `NextResponse.json({ error: "..." }, { status })`.
- **Pages**: Return `null` if unauthorized before fetching data. Use `notFound()` for missing resources.
- **Client**: Show errors inline using `Alert` component or local state.
- **User-facing messages**: Short, friendly, no technical details. Do not expose stack traces, DB errors, or internal paths.

## API Responses

- Success: `NextResponse.json({ success: true, data }, { status: 201/200 })`.
- Error: `NextResponse.json({ error: "User-friendly message" }, { status: 400/401/403/404/500 })`.
- List endpoints return `{ items: [...] }` or `{ documents: [...] }` depending on existing convention. Follow the pattern of the specific endpoint.

## Forms

- Client forms use native HTML `<form>` with `onSubmit`.
- File uploads use `FormData`.
- Server validation repeats client validation; do not trust client input.

## Validation

- File validation: `validateFileTypeAndExtension()` in `src/lib/blob.ts`.
- Body validation: manual checks in API routes (no zod schema validation observed in routes currently).
- Folder ownership: `checkFolderAccess(userId, folderId).isOwner`.

## Imports

- Use `@/` for `src/` imports.
- Group imports: React/Next.js, third-party, internal components, internal lib, internal types, icons.
- Avoid deep relative imports (`../../../../`).

## Styling

- Use Tailwind utilities.
- Prefer semantic color tokens: `bg-surface`, `text-text-primary`, `border-border-subtle`, `text-brand`, `bg-brand-subtle`.
- Spacing: `p-4`, `gap-4`, `space-y-6` are common defaults.
- Responsive: `md:` is the primary breakpoint; `sm:` and `lg:` are used as needed.
- Rounded corners: `rounded-lg` (0.5rem), `rounded-xl` (0.75rem), `rounded-2xl` (1rem) are common.
- Use `cn()` for conditional classes.

## Accessibility

- Modals lack `role="dialog"`, `aria-modal`, and focus trapping. Do not add without being asked, but if you touch a modal, preserve existing behavior.
- Icon-only buttons use `title` or `aria-label` inconsistently. Follow existing pattern if modifying.
- Links used as cards are an established pattern (`<Link>` wrapping card content).

## Comments

- JSDoc comments are used in `src/lib/authz.ts` for public functions.
- Avoid adding comments unless necessary for complex logic.

## Logging

- Server-side errors: `console.error("context:", error)`.
- Do not log sensitive data (document contents, tokens, API keys).
- Client-side: `console.error` for debugging in event handlers.

## Reusable Utilities

- Check `src/lib/utils.ts` for `cn()`.
- Check `src/lib/blob.ts` for file validation and upload.
- Check `src/lib/authz.ts` for access checks.
- Search before creating new utilities or components. Reuse existing `ui/` primitives.

## Testing

- No test framework is configured.
- If adding tests, use a framework compatible with Next.js (e.g., Vitest or Jest).
- Focus tests on authorization boundaries and security rules.

## Rules for Modifying Existing Code

- Before modifying a component, inspect its existing consumers.
- Preserve existing prop interfaces unless the task requires changing them.
- Preserve existing behavior unless the task explicitly requires changing it.
- Avoid large refactors unless explicitly requested.

## Rules for Adding Dependencies

- Do not add dependencies without explicit request.
- Prefer existing libraries already in the project.
- If adding a dependency, update `package.json` with Yarn (`yarn add <pkg>`).

## Rules for Database / Schema Changes

- Edit `prisma/schema.prisma`.
- Run `yarn db:generate` after schema changes.
- Run `yarn db:migrate` for production-like migrations.
- Never manually edit the production database.

## Rules for Generated Files

- Do not edit `.next/`, `node_modules/`, or generated Prisma client files.
- Do not commit `.env` or `.env.local`.

## Definition of Done

- Code follows existing patterns.
- `yarn lint` passes.
- `yarn type-check` passes.
- Authorization is verified server-side.
- No secrets are exposed.
- Existing behavior is preserved unless changed by the task.
- Search before creating new utilities/components; reuse existing abstractions when appropriate.
- Avoid duplicate implementations and unnecessary dependencies.
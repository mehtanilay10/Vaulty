# Vaulty — AI Agent & Developer Guide

> **Source of truth:** This guide and the companion documents in `.agents/` describe the checked-in repository, not an aspirational roadmap. Verified against the codebase and updated on 2026-11-21. Re-check code before relying on any behavior that may have changed.

## Mission

Vaulty is a private personal and family information workspace for important documents, credentials, wealth records, reminders, and AI-assisted understanding. It is a Next.js application backed by PostgreSQL/Prisma, Google Drive, Auth.js, and Google Gemini.

---

## Consolidated Documentation Index

The developer and agent documentation has been consolidated into 7 focused, non-redundant guides:

| Document                                                                              | Primary Scope & Focus Areas                                                                                                                                                     |
| :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [**`AGENTS.md`**](file:///d:/GitHub/Vaulty/.agents/AGENTS.md)                         | Central entry point, mission, non-negotiable engineering rules, and repository map.                                                                                             |
| [**`PRODUCT.md`**](file:///d:/GitHub/Vaulty/.agents/PRODUCT.md)                       | Product scope, supported surfaces, implemented modules, and complete business workflows (Documents, AI, Credentials, Wealth, Statement/Email sync, Reminders, Family).          |
| [**`ARCHITECTURE.md`**](file:///d:/GitHub/Vaulty/.agents/ARCHITECTURE.md)             | Runtime topology, data flow, external integrations (Drive, Gemini, Resend, Gmail/Outlook, Web Push), client-side envelope encryption, App Lock PIN sync, and security controls. |
| [**`DATA_MODEL.md`**](file:///d:/GitHub/Vaulty/.agents/DATA_MODEL.md)                 | PostgreSQL data model, Prisma schema, enums, performance compound indexes, and migration guidelines.                                                                            |
| [**`API.md`**](file:///d:/GitHub/Vaulty/.agents/API.md)                               | Exhaustive REST API reference across all routes, request/response formats, query optimization, CSRF, and cron bearer authorization.                                             |
| [**`DEVELOPMENT.md`**](file:///d:/GitHub/Vaulty/.agents/DEVELOPMENT.md)               | Setup, environment variables, NPM scripts, background workers/cron, automated testing (31 test suites / 238 tests), manual QA checklists, and troubleshooting guide.            |
| [**`CODING_CONVENTIONS.md`**](file:///d:/GitHub/Vaulty/.agents/CODING_CONVENTIONS.md) | Code architecture, server/client boundaries, avoiding $N+1$ queries, UI/UX visual design system, typography scale, single-primary button hierarchy, and accessibility rules.    |

---

## Non-Negotiable Engineering Rules

1. **Inspect before editing:** Read the target route, its client component, domain service/helper, Prisma model, and relevant tests before modifying behavior.
2. **Treat code as truth:** If docs disagree with source, verify source and update docs in the same change. Never copy a stale or aspirational claim forward.
3. **Keep authorization server-side:** Hiding a button or route link is not authorization. Check ownership, direct shares, family module permissions, and credential-vault access on every protected resource operation.
4. **Authenticate and validate at API boundaries:** Use `getCurrentUser()` or `auth()`, Zod or explicit validation (including length caps on encrypted fields), and double-submit CSRF validation on all cookie-authenticated mutations.
5. **Respect the existing stack:** Next.js App Router (Next.js 16.4.5), TypeScript (strict mode), React 19.3.1, Yarn 4.5.3, Tailwind CSS v4, Prisma 6.3, PostgreSQL, Auth.js v5 beta, Gemini (`@google/genai`). Do not replace libraries or restructure architecture without an explicit requirement.
6. **Use Prisma migrations for schema changes:** Add an ordered migration (`yarn prisma migrate dev`), regenerate Prisma Client, and update `DATA_MODEL.md`. Never silently rely on `db push` for production.
7. **Preserve data ownership boundaries:** A family member's read-only access does not make them an owner. Family data is accessed through explicit owner/member routes. The user's own document library displays owned vault documents.
8. **Do not leak secrets:** Never log OAuth tokens, credential plaintext, master passwords, recovery keys, full email bodies, or sensitive document content. Sanitized error responses must not leak storage IDs, provider errors, or internal paths.
9. **Eliminate $N+1$ database queries:** Never loop through candidate items awaiting remote database calls for authorization checks. Scope queries via database `where` clauses and perform candidate validations in memory.
10. **Distributed rate limiting & memory safety:** Never use in-memory `Map` counters for rate limiting; use PostgreSQL-backed `consumeSecurityAttempt` (`SecurityRateLimit`). Enforce strict memory bounds on scrypt (`maxmem: 128MB`), buffer conversions (avoid spread-operator stack limits), and ZIP takeout budgets (50MB/file, 200MB total).
11. **Maintain UI consistency & button hierarchy:** Use shared UI primitives (`src/components/ui/`), semantic tokens, a single solid primary button per section, and accessible touch/keyboard targets (`tabIndex={0}`, Enter/Space).
12. **Keep docs in sync:** Changes to routes, models, environment variables, integrations, scheduled jobs, security controls, or product-visible behavior require corresponding `.agents/*.md` and README updates.

---

## Repository Map

```text
src/
  app/                 App Router pages, layouts, API route handlers
  components/          Feature UI and shared components
    ui/                Domain-agnostic shared primitives (Button, Modal, Card, Blade...)
    shell/             App shell, navigation, page headers, command palette
  lib/                 Domain services, authorization, integrations, workers
  types/               Shared domain and DTO interfaces
  workers/             Standalone worker entry points (ai-worker.ts, email-worker.ts)
prisma/
  schema.prisma        PostgreSQL data model
  migrations/          Ordered SQL migrations
  seed.ts              Seed script
public/                PWA assets, brand SVGs, service worker (sw.js)
.agents/               Consolidated AI agent and developer documentation
```

---

## Safe Change Workflow

1. Identify all affected surfaces: page, client component, API, domain helper, Prisma model, integrations, worker, tests, docs.
2. Read adjacent implementations and follow their established patterns.
3. Validate all input on the server; scope database queries to the authenticated user or authorized owner.
4. Make related database writes transactional (`prisma.$transaction`) where consistency requires it.
5. Add or update focused unit tests; run `yarn type-check` and `yarn test`.
6. Review `git diff` for accidental secrets, unrelated formatting, generated files, or data migrations that are not backward-safe.

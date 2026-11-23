# Contributing to Vaulty

Thanks for your interest in contributing! Vaulty is licensed under the
[GNU General Public License v3.0](LICENSE).

## Before you start

- **Discuss first.** For significant features or architectural changes, open an
  issue or start a discussion before writing code.
- **Read the docs.** Vaulty keeps detailed project guidance in
  [`.agents/`](.agents/AGENTS.md): product scope, architecture, data model,
  API surface, development setup, and coding conventions.
- **Respect the security boundaries.** This app handles credentials and
  financial data. Do not weaken encryption, authorization, CSRF, or rate-limit
  protections to make a feature easier.

## Development setup

See [README.md](README.md#getting-started) and
[`.agents/DEVELOPMENT.md`](.agents/DEVELOPMENT.md) for prerequisites,
environment variables, and scripts. The short version:

```bash
corepack enable
yarn install
cp .env.example .env   # fill in required values
yarn prisma generate
yarn db:migrate
yarn dev
```

## Workflow

1. Create a focused branch from `main`.
2. Follow [`.agents/CODING_CONVENTIONS.md`](.agents/CODING_CONVENTIONS.md) —
   TypeScript strict mode, server/client component boundaries, and the UI
   design system are enforced conventions, not suggestions.
3. Add or update tests for behavior changes. Unit tests live next to source as
   `*.test.ts` (Vitest); browser tests live in `e2e/` (Playwright).
4. Update `.agents/` documentation and `.env.example` when behavior or
   configuration changes — this is a hard requirement of the project.
5. Run the checks before pushing:

   ```bash
   yarn type-check
   yarn lint
   yarn test
   yarn build   # when practical
   ```

   Husky + lint-staged run Prettier and ESLint on staged files automatically.

6. Open a pull request using the template. Include a concise description,
   testing evidence, migration notes, and screenshots for UI changes.

## What to include in a PR

- **Summary** — what changed and why.
- **Test plan** — how you verified it (commands run, manual steps).
- **Migration notes** — if the Prisma schema or env vars changed.
- **Docs updates** — confirm `.agents/` and `.env.example` are in sync.

## Ground rules

- Do not commit secrets, `.env` files, real personal documents, database dumps,
  or production user data.
- Do not edit historical Prisma migrations that may already be applied.
- Keep commits focused; do not mix unrelated refactors with feature work.
- Be respectful. This project follows the
  [Contributor Covenant](CODE_OF_CONDUCT.md).

## Reporting security issues

**Do not open public issues for vulnerabilities.** See
[SECURITY.md](SECURITY.md) for the private reporting process.

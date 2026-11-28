# Vaulty — Coding Conventions

---

## Server vs Client Boundaries

- **App Router Defaults**: Keep `src/app/**/page.tsx` and layouts as Server Components where possible, hydrating interactive client islands (`*Client.tsx` under `src/components/`) with initial scoped server queries.
- **Zero-Knowledge Secret Boundary**: Never handle plaintext credential secrets, master passwords, recovery keys, or unencrypted TOTP seeds on the server (`src/lib/envelope-crypto.ts` runs strictly in browser Web Crypto).
- **Local Statement Decryption Boundary**: Unlock password-protected PDF bank statements on the client (`pdfjs-dist` + `src/lib/pdf-passwords.ts`) before transmitting parsed rows/text.

---

## API Handler Discipline

1. **Authenticate First**: Resolve the authenticated user via Auth.js helpers and check ownership / family module access (`src/lib/authz.ts`, `src/lib/family-access.ts`, `src/lib/vault-access.ts`).
2. **Validate Input Explicitly**: Validate request bodies, bounds (`MAX_STRING_LENGTH`, `MAX_ARRAY_ITEMS`, `MAX_UPLOAD_SIZE`), identifiers (`SAFE_IDENTIFIER_PATTERN`, `UUID_REGEX`), and dates (`src/lib/api-validation.ts`, `src/lib/validation.ts`).
3. **CSRF & Rate Limits**: Cookie-authenticated mutations must verify CSRF (`src/lib/csrf.ts`); expensive/sensitive endpoints must apply `userRateLimitResponse` (`src/lib/rate-limits.ts`).
4. **Sanitize Responses**: Use standardized helpers (`src/lib/api-response.ts`, `src/lib/db-error.ts`) and never leak raw Prisma internals, Google Drive file IDs where inappropriate, stack traces, or OAuth tokens.
5. **Avoid $N+1$ Database Queries**: Scope list queries in Prisma `where` clauses or batch fetches (`findMany` + in-memory maps) rather than awaiting individual checks in loops.
6. **Transactions**: Wrap multi-table state changes (account merges, family invitation acceptance, key re-keying, bulk operations) in `prisma.$transaction`.

---

## TypeScript & Testing Standards

- **Strict Mode**: Code must pass `yarn type-check` (`tsc --noEmit`) with zero errors and `yarn lint` without errors.
- **Shared DTOs**: Put cross-layer interfaces in `src/types/` and shared domain constants in `src/lib/constants.ts`.
- **Unit & Integration Tests**: Co-locate Vitest tests (`*.test.ts`) beside library modules and API routes (currently 36 test files across `src/lib/`, `src/app/api/`, and `src/types/`). Verify behavior with `yarn test`.
- **Documentation Integrity**: Preserve existing comments/docstrings unless changed; update `.agents/*.md` and `README.md` alongside user-visible, schema, or API changes.

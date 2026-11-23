# Security Policy

## Supported versions

Vaulty is under active development and does not currently publish versioned
releases. Security fixes are applied to the `main` branch. If you self-host,
pull `main` regularly and review the [changelog-relevant commits](https://github.com/mehtanilay10/Vaulty/commits/main)
before upgrading.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via GitHub's
[private vulnerability reporting](https://github.com/mehtanilay10/Vaulty/security/advisories/new)
("Report a vulnerability" under the repository's Security tab). If that is
unavailable, contact the maintainer directly and request a private channel.

Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof of concept.
- Affected routes, modules, or components.
- Any suggested mitigation, if known.

Do **not** include real personal data, credentials, document contents, database
dumps, or production secrets in your report.

## What to expect

- You will receive an acknowledgment within a reasonable timeframe.
- We will investigate, reproduce, and work on a fix.
- Once resolved, we will credit you in the security advisory (unless you
  prefer to remain anonymous) and may publish a GitHub Security Advisory.

## Scope notes

Vaulty handles sensitive personal data (documents, credentials, financial
records). Areas of particular interest include:

- Authentication and session handling (`src/auth.ts`, `src/lib/session-validation.ts`).
- Client-side encryption and key management (`src/lib/envelope-crypto.ts`,
  `src/lib/key-wrap.ts`, `src/lib/family-crypto.ts`).
- Authorization checks on API routes (`src/lib/authz.ts`, `src/lib/family-access.ts`).
- CSRF and rate limiting (`src/lib/csrf.ts`, `src/lib/security-rate-limit.ts`).
- OAuth token storage and refresh flows (`src/lib/gmail/`, `src/lib/outlook/`,
  `src/lib/google-drive/`).

Known limitations are documented in
[`.agents/ARCHITECTURE.md`](.agents/ARCHITECTURE.md#4-security--cryptography-model)
— please read it before reporting issues that are already documented
limitations (e.g., credential vault key-extractability caveats, passkey
app-lock not being server-verified WebAuthn).

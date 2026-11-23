# API Reference

> Route inventory verified against checked-in `src/app/api/**/route.ts` files on 2026-11-21. This is a route and method index; read the implementation files for validation schemas, authorization checks, status codes, and DTO details. Auth.js exports its handlers as `GET` and `POST`.

## Operations & admin

- `POST|GET /api/admin/ai-worker`: trigger immediate AI queue worker processing.
- `POST /api/admin/cleanup-ai`: clean up stale AI jobs stuck in processing.
- `GET|POST /api/cron/ai-worker`: cron trigger for AI document processing queue. Authenticated via `Authorization: Bearer <CRON_SECRET>`.
- `GET /api/cron/reminders`: scheduled reminder, document expiry, and credit card due-date processor. Authenticated via `Authorization: Bearer <CRON_SECRET>`.
- `GET|POST /api/cron/email-sync`: scheduled email multi-module sync across connected Gmail/Outlook accounts with auto-import and review queue segregation (transactions, important documents, reminders). Authenticated via `Authorization: Bearer <CRON_SECRET>`.

## Authentication

- `GET|POST /api/auth/[...nextauth]`: Auth.js handlers for Google OAuth and email magic link authentication.
- `GET /api/dev-login`: development-only quick login bypass for local testing. Strictly restricted to `NODE_ENV === "development"`, returns 404 in all other environments, and dynamically reads `DEV_LOGIN_EMAIL` from `.env.local`. Rate-limited via `SecurityRateLimit`.

## AI chat

- `GET /api/chat/[sessionId]/messages`: list chronological messages for an active chat session.
- `POST /api/chat`: conversational assistant grounded in the user's authorized document content via Gemini.

## Documents & AI

- `GET /api/documents`: paginated document listing; supports `scope=owned` (default) or `scope=all`, filtering by query `q`, `fileType`, `aiStatus`, `folderId`, and sorting.
- `POST /api/documents/upload`: multipart upload for PDF, JPEG, PNG, and WebP files up to `MAX_UPLOAD_SIZE` (default 50 MiB). Sanitizes errors to prevent storage leakage.
- `GET|PATCH|DELETE /api/documents/[id]`: get metadata, update document properties (name, folder, tags, expiry date), or delete document (concurrently deletes Google Drive artifacts with 404 resilience and executes atomic batch SQL transaction).
- `GET /api/documents/[id]/file`: stream original binary from Google Drive; returns 404 `DRIVE_FILE_NOT_FOUND` when missing.
- `GET|PUT /api/documents/[id]/dates`: get or update extracted expiry and important dates; recalculates associated reminders.
- `POST /api/documents/[id]/ai`: trigger Gemini extraction and summary for an individual document.
- `POST /api/documents/[id]/append-page`: multipart upload appending one or more scanned pages or PDF pages to an existing document on Google Drive; converts single images to multi-page PDFs, updates file content, and re-triggers AI extraction when enabled.
- `POST /api/documents/ai/batch`: queue multiple documents for AI processing.
- `GET /api/documents/expiring`: fetch documents expiring within a given window.
- `GET|POST|DELETE /api/documents/[id]/share`: manage public share links with optional password, expiry, and view limits. Unbiased token generation using `randomInt`.

## Family

- `GET /api/family`: list family members, invitations, and active module permissions. Rate-limited via `SecurityRateLimit`.
- `POST /api/family/invitations`: create an email-bound invitation with granular module flags (`shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`, `shareNotes`).
- `POST /api/family/invitations/accept`: accept an invitation for the authenticated user matching the invited email.
- `POST /api/family/invitations/reject`: reject an invitation.
- `POST /api/family/invitations/[id]/resend`: resend pending invitation email.
- `PATCH|DELETE /api/family/invitations/[id]`: update permissions or revoke a pending invitation.
- `PATCH|DELETE /api/family/members/[id]`: update member module flags or remove membership.
- `GET /api/family/documents`: list documents shared with the user through family memberships.
- `GET /api/family/wealth`: list wealth accounts and transactions shared through family memberships.
- `GET /api/family/credentials`: list credentials shared through family memberships.
- `GET /api/family/notes`: list note pages shared through family memberships.
- `GET|POST /api/family/credentials/key`: retrieve or store the user's family credential keypair.
- `POST|DELETE /api/family/credentials/key/[membershipId]`: share or revoke wrapped credential keys for a specific family member.
  _(Note: Family reminders are queried directly in `/reminders/page.tsx` via `FamilyMembership.shareReminders` without exposing an unauthenticated API endpoint)._

## Folders

- `GET|POST /api/folders`: list top-level folders or create a new folder.
- `GET|PATCH|DELETE /api/folders/[id]`: get folder contents, rename/move folder (with character sanitization), or delete folder.
- `POST|DELETE /api/folders/[id]/shares`: create or revoke a direct read-only folder share.
- `POST|DELETE /api/folders/[id]/shares`: create or revoke a direct read-only folder share.

## Integrations

- `GET /api/integrations/google-drive/connect`: initiate Google Drive OAuth flow.
- `GET /api/integrations/google-drive/callback`: handle Google Drive OAuth callback.
- `DELETE /api/integrations/google-drive/disconnect`: disconnect Google Drive.
- `GET /api/integrations/google-drive/status`: check Google Drive connection and sync health.
- `POST /api/integrations/google-drive/sync`: trigger manual Drive synchronization.
- `POST|GET /api/integrations/google-drive/webhook`: Drive change notifications receiver.
- `GET /api/integrations/gmail/connect`: initiate Gmail `gmail.readonly` OAuth flow.
- `GET /api/integrations/gmail/callback`: handle Gmail OAuth callback.
- `POST /api/integrations/gmail/disconnect`: disconnect Gmail connection.
- `GET /api/integrations/gmail/status`: check Gmail connection status.
- `POST /api/integrations/gmail/sync`: trigger manual Gmail transaction sync page fetch.
- `GET|PATCH /api/integrations/gmail/imports`: list or update review status of imported email transaction candidates.
- `POST /api/integrations/gmail/imports/commit`: commit approved candidates into matching Wealth accounts.
- `GET /api/integrations/outlook/connect`: initiate Microsoft Entra Outlook OAuth flow.
- `GET /api/integrations/outlook/callback`: handle Outlook OAuth callback.
- `POST /api/integrations/outlook/disconnect`: disconnect Outlook connection.
- `GET /api/integrations/outlook/status`: check Outlook connection status.
- `POST /api/integrations/outlook/sync`: trigger manual Outlook transaction sync.
- `GET|PATCH /api/integrations/email/documents`: list or update discovered important document candidates from emails.
- `POST /api/integrations/email/documents/import`: import selected or all pending email documents into Document Vault.
- `POST /api/integrations/email/documents/dismiss`: dismiss selected or all pending email documents.
- `GET|PATCH /api/integrations/email/reminders`: list or update discovered due date and expiry reminders from emails.
- `POST /api/integrations/email/reminders/import`: add selected or all pending email reminders into Reminders calendar.
- `POST /api/integrations/email/reminders/dismiss`: dismiss selected or all pending email reminders.

## Notifications & push

- `GET|PATCH /api/notifications`: list notifications or mark notifications as read.
- `GET|POST|DELETE /api/push/subscription`: check VAPID status, register a browser push subscription endpoint, or remove subscription.

## Credential vault

- `POST /api/passwords/setup`: initialize master password and encryption parameters for a new vault.
- `POST /api/passwords/unlock`: verify master password and retrieve encryption salt/iterations. Enforces 5-attempt brute-force lockout (`lockedUntil`, 15 min lock).
- `POST /api/passwords/change-master-password`: change master password and commit re-encrypted credential payloads. Enforces the same 5-attempt brute-force lockout and logs `MASTER_PASSWORD_CHANGE_FAILED`.
- `GET|POST /api/passwords/app`: list or create client-side encrypted app credentials and 2FA TOTP secrets (`totpSecret`). Validates input schema via Zod with string/ciphertext length caps (100,000 chars).
- `PUT|DELETE /api/passwords/app/[id]`: update or delete an app credential.
- `GET|POST /api/passwords/bank`: list or create client-side encrypted bank credentials. Validates input schema via Zod with string/ciphertext length caps.
- `PUT|DELETE /api/passwords/bank/[id]`: update or delete a bank credential.
- `POST /api/passwords/audit`: log credential access, copy, or reveal events.
- `POST /api/passwords/recovery/setup`: configure offline recovery key and security questions.
- `GET|POST /api/passwords/recovery/verify`: verify security questions for recovery. Token-gated by emailed reset token (exempt from standard session middleware).
- `POST /api/passwords/recovery/rekey`: zero-knowledge browser re-encryption of all credentials using recovery key. Token-gated by emailed reset token.
- `POST /api/passwords/reset/request`: initiate master password reset request and dispatch reset email.
- `POST /api/passwords/reset/confirm`: confirm master password reset (blocks if vault has credentials and recovery is unconfigured).
- `GET|POST|DELETE /api/passwords/vaults/[id]/share`: legacy vault-level sharing endpoints.
- `GET /api/passwords/vaults/shared`: list shared vaults.

## Notes

- `GET|POST /api/notes`: list user's note pages (sorted by pinned desc, updated desc; supports `q` query search) or create a new note page.
- `GET|PATCH|DELETE /api/notes/[id]`: retrieve note page (enforcing user ownership or family notes access), update note (title, content, todos, images, color, isPinned, isArchived), or delete note page.
- `POST|DELETE /api/notes/[id]/images`: upload image attachment (multipart file or base64 data URL) or remove attachment by `imageId`.

## Reminders

- `GET|POST|PATCH|DELETE /api/reminders`: list active/completed reminders, create new custom reminders, toggle completion, or delete reminders.

## Search

- `GET /api/search`: full-page document search; scopes to authorized records in a single database query, scores relevance in memory, and returns results in sub-100ms.
- `GET /api/search/omni`: universal ⌘K Omnibox search across documents, folders, wealth accounts, non-secret credential names, and reminders.

## Public sharing

- `GET|POST /api/share/[token]`: verify public share link access (validating optional scrypt password with 128MB memory cap, expiry, and max view limits).
- `GET /api/share/[token]/file`: stream shared document binary. View counts decrement only after storage file stream successfully commences.

## User & settings

- `DELETE /api/user/account`: transactional full account deletion across 20+ tables (all user records, Drive folder, verification tokens, rate limit entries, and OAuth credentials).
- `GET|POST|DELETE /api/user/app-lock`: manage cross-device App Lock PIN hash and wrapped convenience key synchronization.
- `GET /api/user/audit-logs`: fetch security and access audit logs.
- `DELETE /api/user/drive-docs`: purge Drive document files while retaining database structure.
- `POST /api/user/sessions/revoke`: increment `sessionVersion` to invalidate all active JWT sessions.
- `PATCH /api/user/settings`: update user preferences (theme, notification channels).
- `GET /api/user/stats`: fetch aggregated vault statistics.
- `GET /api/user/takeout`: stream complete account export as a ZIP archive. Enforces memory bounds (max 50 files, 50 MiB/file, 200 MiB total budget).
- `GET /api/users/search`: search users for sharing invitations. Rate-limited via `SecurityRateLimit`.
- `GET|PUT /api/settings/pdf-passwords`: retrieve masked configuration or update AES-256-GCM encrypted PDF password templates and personal tokens.
- `GET|PATCH /api/settings/inbound-email`: retrieve or update inbound forwarding address, token, allowed sender whitelist, and enablement.

## Webhooks

- `POST /api/webhooks/resend/inbound`: receives Resend `email.received` webhook with Svix signature verification, resolves user from recipient (`username+docs@vaulty.mnilay.com`), decrypts password-protected PDF statements via `PdfPasswordSettings`, stages binary attachments in `InboundEmailAttachment`, and invokes AI multi-module classification for documents, reminders, and wealth transactions.

## Wealth

- `GET|POST /api/wealth/accounts`: list owned wealth accounts or create a new account.
- `GET|PATCH|DELETE /api/wealth/accounts/[id]`: get account detail, update account properties, or delete account.
- `POST /api/wealth/accounts/bulk-delete`: bulk delete multiple wealth accounts and associated transactions.
- `POST /api/wealth/accounts/[id]/merge`: merge source account into target account, reassigning transactions and recomputing running balances.
- `GET|POST /api/wealth/accounts/[id]/transactions`: list paginated transactions or create a new transaction.
- `GET|PATCH|DELETE /api/wealth/accounts/[id]/transactions/[transactionId]`: get, update, or delete a transaction; chronologically recomputes running balances (`balanceAfter`).
- `POST /api/wealth/statements/upload`: upload a financial statement binary.
- `POST /api/wealth/statements/parse`: parse statement text locally into structured transaction candidates.
- `POST /api/wealth/statements/import`: commit parsed transactions into a Wealth account.
- `GET /api/wealth/summary`: currency-separated aggregates of assets, liabilities, and net worth.

## API implementation rules

- Authenticate protected requests using `getCurrentUser()` or `auth()`; return `401` when unauthenticated.
- Validate incoming JSON, query parameters, and multipart form data with Zod or explicit checks.
- Call `validateCSRFRequest(req)` on cookie-authenticated mutations.
- Scope database queries strictly to the authenticated user or authorized owner.
- Return `Cache-Control: private, no-store` headers for sensitive responses.
- Do not expose OAuth tokens, master passwords, recovery keys, credential plaintext, or full email bodies in responses.

# Vaulty — REST API Reference

All API handlers live under `src/app/api/`. Unless otherwise noted:

- Authenticated endpoints require a valid Auth.js session with matching `sessionVersion` (`src/proxy.ts`).
- Cookie-authenticated mutations (`POST`, `PUT`, `PATCH`, `DELETE`) require double-submit HMAC CSRF header + cookie validation (`src/lib/csrf.ts`, helper `csrfFetch` in `src/lib/csrf-client.ts`).
- Heavy/sensitive endpoints apply distributed PostgreSQL rate limiting (`src/lib/rate-limits.ts`).

---

## Auth, Cron, Admin & Webhooks

| Endpoint                       | Methods       | Auth & Purpose                                                                                |
| :----------------------------- | :------------ | :-------------------------------------------------------------------------------------------- |
| `/api/auth/[...nextauth]`      | `GET`, `POST` | Auth.js v5 OAuth (Google) & Email Magic Link handlers                                         |
| `/api/dev-login`               | `GET`         | Local `NODE_ENV=development` bypass for `DEV_LOGIN_EMAIL`                                     |
| `/api/cron/ai-worker`          | `GET`, `POST` | `CRON_SECRET` Bearer-authenticated Gemini AI batch processor                                  |
| `/api/cron/email-sync`         | `GET`, `POST` | `CRON_SECRET` Bearer-authenticated Gmail/Outlook sync sweep                                   |
| `/api/cron/reminders`          | `GET`         | `CRON_SECRET` Bearer-authenticated daily reminder dispatcher (`vercel.json`)                  |
| `/api/admin/ai-worker`         | `GET`, `POST` | `ADMIN_EMAILS`-restricted AI queue inspection & trigger                                       |
| `/api/admin/cleanup-ai`        | `POST`        | `ADMIN_EMAILS`-restricted stalled AI job recovery/cleanup                                     |
| `/api/webhooks/resend/inbound` | `POST`        | Resend webhook signature (`RESEND_INBOUND_WEBHOOK_SECRET`) inbound attachment/email ingestion |

---

## Documents, Folders, Search, Chat & Public Shares

| Endpoint                          | Methods                  | Purpose & Protection                                                                           |
| :-------------------------------- | :----------------------- | :--------------------------------------------------------------------------------------------- |
| `/api/documents`                  | `GET`                    | List owned/accessible documents with filter & search                                           |
| `/api/documents/upload`           | `POST`                   | Upload file to Google Drive + create `Document` & AI job (rate limit: `documentsUpload`)       |
| `/api/documents/bulk`             | `POST`                   | Bulk document actions (rate limit: `documentsBulk`)                                            |
| `/api/documents/expiring`         | `GET`                    | Upcoming expiring documents feed                                                               |
| `/api/documents/ai/batch`         | `POST`                   | Queue batch AI processing (rate limit: `documentsAiBatch`)                                     |
| `/api/documents/[id]`             | `GET`, `PATCH`, `DELETE` | Fetch metadata, rename/move/update tags/properties, or delete document                         |
| `/api/documents/[id]/file`        | `GET`                    | Stream or download Drive-backed document bytes (checks ownership, share grants, family access) |
| `/api/documents/[id]/ai`          | `POST`                   | Trigger document summarization or contextual Q&A (rate limit: `documentsAi`)                   |
| `/api/documents/[id]/append-page` | `POST`                   | Append camera-scanned image/PDF page onto an existing PDF (rate limit: `documentsAppendPage`)  |
| `/api/documents/[id]/dates`       | `PUT`                    | Update extracted or manual important/expiry dates on a document                                |
| `/api/documents/[id]/share`       | `GET`, `POST`, `DELETE`  | List, create, or revoke `ShareLink` grants (rate limit: `documentsShare`)                      |
| `/api/folders`                    | `GET`, `POST`            | List folder hierarchy or create a folder                                                       |
| `/api/folders/[id]`               | `GET`, `PATCH`, `DELETE` | Read folder tree slice, rename/move, or delete folder                                          |
| `/api/folders/[id]/shares`        | `POST`, `DELETE`         | Grant or revoke `FolderShare` access by user                                                   |
| `/api/share/[token]`              | `GET`, `POST`            | Public tokenized share metadata & optional passcode verification                               |
| `/api/share/[token]/file`         | `GET`                    | Public tokenized file streaming for valid shares                                               |
| `/api/search`                     | `GET`                    | Full search across library (rate limit: `search`)                                              |
| `/api/search/omni`                | `GET`                    | Fast Command Palette `Cmd+K` search (rate limit: `searchOmni`)                                 |
| `/api/chat`                       | `POST`                   | Send AI Chat turn across document vault                                                        |
| `/api/chat/[sessionId]/messages`  | `GET`                    | Fetch persistent messages for a `ChatSession`                                                  |

---

## Credentials Vault, 2FA TOTP & App Lock

| Endpoint                                | Methods                 | Purpose & Protection                                                                                                                |
| :-------------------------------------- | :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `/api/passwords/setup`                  | `POST`                  | Initialize `PasswordVault`, salt, iterations & master password verifier (rate limit: `passwordsSetup`)                              |
| `/api/passwords/unlock`                 | `POST`                  | Verify master password, enforce vault lockouts (`MAX_FAILED_ATTEMPTS = 5`), return wrapped metadata (rate limit: `passwordsUnlock`) |
| `/api/passwords/change-master-password` | `POST`                  | Rotate KEK and re-wrapped key/verifier payloads (rate limit: `passwordsChangeMaster`)                                               |
| `/api/passwords/reset/request`          | `POST`                  | Request master password reset flow                                                                                                  |
| `/api/passwords/reset/confirm`          | `POST`                  | Confirm master password reset (rate limit: `passwordsResetConfirm`)                                                                 |
| `/api/passwords/recovery/setup`         | `POST`                  | Store offline recovery KEK bundle & questions (rate limit: `passwordsRecoverySetup`)                                                |
| `/api/passwords/recovery/verify`        | `GET`, `POST`           | Retrieve recovery challenge or verify offline recovery proof (public-gated for recovery)                                            |
| `/api/passwords/recovery/rekey`         | `POST`                  | Commit re-keyed ciphertexts after offline recovery                                                                                  |
| `/api/passwords/app`                    | `GET`, `POST`           | List or create encrypted `AppCredential` records (supports optional `totpSecret`)                                                   |
| `/api/passwords/app/[id]`               | `PUT`, `DELETE`         | Update or delete an `AppCredential`                                                                                                 |
| `/api/passwords/bank`                   | `GET`, `POST`           | List or create encrypted `BankCredential` records                                                                                   |
| `/api/passwords/bank/[id]`              | `PUT`, `DELETE`         | Update or delete a `BankCredential`                                                                                                 |
| `/api/passwords/audit`                  | `POST`                  | Record/query `PasswordAuditLog` vault access events                                                                                 |
| `/api/passwords/vaults/shared`          | `GET`                   | List vaults shared with the authenticated user (`VaultShare`)                                                                       |
| `/api/passwords/vaults/[id]/share`      | `GET`, `POST`, `DELETE` | Manage direct `VaultShare` permissions                                                                                              |
| `/api/user/app-lock`                    | `GET`, `POST`, `DELETE` | Check/enroll/clear synced App Lock PIN hash and wrapped vault key                                                                   |

---

## Wealth & Statement Imports

| Endpoint                                                 | Methods                  | Purpose & Protection                                                                            |
| :------------------------------------------------------- | :----------------------- | :---------------------------------------------------------------------------------------------- |
| `/api/wealth/summary`                                    | `GET`                    | Multi-currency net worth, assets, liabilities & breakdown aggregation                           |
| `/api/wealth/accounts`                                   | `GET`, `POST`            | List wealth accounts or create a new `WealthAccount`                                            |
| `/api/wealth/accounts/[id]`                              | `GET`, `PATCH`, `DELETE` | Inspect, update, or delete an account                                                           |
| `/api/wealth/accounts/[id]/merge`                        | `POST`                   | Merge one wealth account and its transactions into a target account                             |
| `/api/wealth/accounts/bulk-delete`                       | `POST`                   | Bulk delete multiple selected wealth accounts                                                   |
| `/api/wealth/accounts/[id]/transactions`                 | `GET`, `POST`            | List or create transactions under an account                                                    |
| `/api/wealth/accounts/[id]/transactions/[transactionId]` | `GET`, `PATCH`, `DELETE` | Inspect, edit, or delete a single `WealthTransaction`                                           |
| `/api/wealth/statements/upload`                          | `POST`                   | Upload statement file (rate limit: `statementsUpload`)                                          |
| `/api/wealth/statements/parse`                           | `POST`                   | Parse statement rows via deterministic rules or Gemini fallback (rate limit: `statementsParse`) |
| `/api/wealth/statements/import`                          | `POST`                   | Commit parsed statement transactions into an account (rate limit: `statementsImport`)           |

---

## Notes, Reminders, Notifications & Settings

| Endpoint                      | Methods                          | Purpose & Protection                                                            |
| :---------------------------- | :------------------------------- | :------------------------------------------------------------------------------ |
| `/api/notes`                  | `GET`, `POST`                    | List notes (`NotePage`) or create note/checklist/image note                     |
| `/api/notes/[id]`             | `GET`, `PATCH`, `DELETE`         | Read, update content/todos/pin/archive/color, or delete a note                  |
| `/api/notes/[id]/images`      | `POST`, `DELETE`                 | Upload or remove inline image attachments on a note (rate limit: `notesImages`) |
| `/api/reminders`              | `GET`, `POST`, `PATCH`, `DELETE` | Full CRUD, completion toggles, and recurrence rules for `Reminder`              |
| `/api/notifications`          | `GET`, `PATCH`                   | Fetch user notifications feed and mark read                                     |
| `/api/push/subscription`      | `GET`, `POST`, `DELETE`          | Register, inspect, or remove browser Web Push `PushSubscription`                |
| `/api/settings/inbound-email` | `GET`, `PATCH`                   | Read or rotate user's personal Resend inbound forwarding address/token          |
| `/api/settings/pdf-passwords` | `GET`, `PUT`                     | Read or store encrypted reusable `PdfPasswordSettings` templates                |
| `/api/user/settings`          | `PATCH`                          | Update user profile & preference settings                                       |
| `/api/user/stats`             | `GET`                            | Workspace counts and overview statistics                                        |
| `/api/user/audit-logs`        | `GET`                            | Fetch user `AuditLog` entries                                                   |
| `/api/user/takeout`           | `GET`                            | Generate bounded ZIP export of user data (rate limit: `userTakeout`)            |
| `/api/user/sessions/revoke`   | `POST`                           | Increment `User.sessionVersion` to log out active sessions globally             |
| `/api/user/drive-docs`        | `DELETE`                         | Remove synced Drive document index records                                      |
| `/api/user/account`           | `DELETE`                         | Permanently delete user account & cascading records                             |
| `/api/users/search`           | `GET`                            | Look up Vaulty users for sharing & family invitations                           |

---

## Integrations (Google Drive, Gmail, Outlook, Email Staging)

| Endpoint                                    | Methods        | Purpose                                                          |
| :------------------------------------------ | :------------- | :--------------------------------------------------------------- |
| `/api/integrations/google-drive/connect`    | `GET`          | Initiate Google Drive OAuth flow                                 |
| `/api/integrations/google-drive/callback`   | `GET`          | Handle Drive OAuth callback                                      |
| `/api/integrations/google-drive/status`     | `GET`          | Read `StorageConnection` status                                  |
| `/api/integrations/google-drive/sync`       | `POST`         | Trigger manual Drive delta sync                                  |
| `/api/integrations/google-drive/disconnect` | `DELETE`       | Disconnect Drive integration                                     |
| `/api/integrations/google-drive/webhook`    | `GET`, `POST`  | Receive Drive push notifications (`GOOGLE_DRIVE_WEBHOOK_SECRET`) |
| `/api/integrations/gmail/connect`           | `GET`          | Initiate Gmail OAuth flow                                        |
| `/api/integrations/gmail/callback`          | `GET`          | Handle Gmail OAuth callback                                      |
| `/api/integrations/gmail/status`            | `GET`          | Read `GmailConnection` status                                    |
| `/api/integrations/gmail/sync`              | `POST`         | Scan recent Gmail messages into email staging queues             |
| `/api/integrations/gmail/disconnect`        | `POST`         | Disconnect Gmail account                                         |
| `/api/integrations/gmail/imports`           | `GET`, `PATCH` | List/edit staged `EmailTransactionImport` rows                   |
| `/api/integrations/gmail/imports/commit`    | `POST`         | Commit approved email transactions into `WealthTransaction`      |
| `/api/integrations/outlook/connect`         | `GET`          | Initiate Microsoft Outlook OAuth flow                            |
| `/api/integrations/outlook/callback`        | `GET`          | Handle Outlook OAuth callback                                    |
| `/api/integrations/outlook/status`          | `GET`          | Read `OutlookConnection` status                                  |
| `/api/integrations/outlook/sync`            | `POST`         | Scan recent Outlook messages into email staging queues           |
| `/api/integrations/outlook/disconnect`      | `POST`         | Disconnect Outlook account                                       |
| `/api/integrations/email/documents`         | `GET`, `PATCH` | List/update staged `EmailDocumentImport` attachments             |
| `/api/integrations/email/documents/import`  | `POST`         | Import staged email attachment into Google Drive + `Document`    |
| `/api/integrations/email/documents/dismiss` | `POST`         | Dismiss staged email document                                    |
| `/api/integrations/email/reminders`         | `GET`, `PATCH` | List/update staged `EmailReminderImport` bills/due dates         |
| `/api/integrations/email/reminders/import`  | `POST`         | Promote staged email alert into a `Reminder`                     |
| `/api/integrations/email/reminders/dismiss` | `POST`         | Dismiss staged email reminder                                    |

---

## Family Sharing

| Endpoint                                     | Methods           | Purpose                                                                    |
| :------------------------------------------- | :---------------- | :------------------------------------------------------------------------- |
| `/api/family`                                | `GET`             | Fetch owned memberships, joined memberships & pending invitations          |
| `/api/family/invitations`                    | `POST`            | Create expiring `FamilyInvitation` with module toggles                     |
| `/api/family/invitations/[id]`               | `PATCH`, `DELETE` | Update invitation permissions or revoke                                    |
| `/api/family/invitations/[id]/resend`        | `POST`            | Resend invitation email                                                    |
| `/api/family/invitations/accept`             | `POST`            | Accept invitation token -> create `FamilyMembership`                       |
| `/api/family/invitations/reject`             | `POST`            | Reject invitation token                                                    |
| `/api/family/members/[id]`                   | `PATCH`, `DELETE` | Update module access flags or remove member                                |
| `/api/family/documents`                      | `GET`             | Read family-shared documents when `shareDocuments` is active               |
| `/api/family/wealth`                         | `GET`             | Read family-shared wealth accounts when `shareWealth` is active            |
| `/api/family/credentials`                    | `GET`             | Read family-shared encrypted credentials when `shareCredentials` is active |
| `/api/family/credentials/key`                | `GET`, `POST`     | Retrieve/set owner's vault family public/private key material              |
| `/api/family/credentials/key/[membershipId]` | `POST`, `DELETE`  | Store or revoke wrapped `FamilyCredentialKey` for a member                 |
| `/api/family/notes`                          | `GET`             | Read family-shared notes when `shareNotes` is active                       |

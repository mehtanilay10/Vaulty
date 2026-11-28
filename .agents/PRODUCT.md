# Vaulty — Product & Workflows

Vaulty combines personal document storage, encrypted credentials, wealth tracking, notes, reminders, email ingestion, and family collaboration inside one coherent workspace.

---

## Navigation & Surfaces

Authenticated navigation (`src/components/shell/Sidebar.tsx`) is ordered intentionally into two primary groups:

### Your Space

1. **Dashboard** (`/dashboard`) — 3-column desktop bento overview (`lg:grid-cols-3`, `md:grid-cols-2`, `grid-cols-1`) presenting Documents, Wealth, Credentials (including 2FA authenticator count and `Manage credentials` CTA), and Reminders in sidebar module order.
2. **Documents** (`/documents`, `/documents/library`, `/documents/[documentId]`, `/folders`, `/folders/[folderId]`) — Google Drive-backed file library, hierarchical folders, AI summaries & Q&A, expiry dates, direct sharing, and camera multi-page scanning.
3. **Wealth** (`/wealth`, `/wealth/accounts`, `/wealth/accounts/[accountId]`, `/wealth/transactions`, `/wealth/statements/import`) — Multi-currency net worth tracking, 13 account types, transaction ledgers, account merging, and local password-decrypted PDF/CSV/Excel statement parsing.
4. **Credentials** (`/credentials`, `/credentials/account`, `/credentials/bank`) — Zero-knowledge password manager for apps (with 2FA TOTP authenticator & QR scanning) and banking credentials (NetBanking password, ATM PIN, UPI PIN, Mobile App PIN, Transaction PIN).
5. **Reminders** (`/reminders`, `/reminders/calendar-view`) — Scheduled reminders with categories, recurrence rules (`NONE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), custom advance offsets, list & calendar views, email + web push delivery.
6. **Notes** (`/notes`) — Tri-mode notes workspace (Markdown/Rich TipTap notes, checklist/todos, image attachments), pinning, archiving, and color tagging.

### AI & Sharing

7. **AI Chat** (`/chat`) — Conversational AI assistant across the user's document vault with persistent chat sessions and message history.
8. **Email Sync** (`/email-sync`; `/wealth/email-sync` redirects here) — Unified inbox scanner connecting Gmail OAuth, Microsoft Outlook OAuth, and personal Resend inbound forwarding aliases to triage financial transactions, document attachments, and bill/policy reminders.
9. **Family** (`/family`, `/family/accept`, `/family/[ownerId]/*`, `/family/documents`, `/family/wealth`, `/family/credentials`, `/family/notes`, `/family/reminders`) — Opt-in family invitations with per-module boolean toggles and read-only views of shared owner workspaces.

### Additional App & Public Routes

- **Search** (`/search`) + Global Command Palette (`Cmd/Ctrl + K` via `CommandPalette.tsx` hitting `/api/search/omni`)
- **Shared With Me** (`/shared`) + Tokenized public share links (`/share/[token]`)
- **Notifications** (`/notifications`) + Navbar `NotificationsBell`
- **Settings** (`/settings`) — Master password management, offline recovery setup, cross-device App Lock PIN, reusable PDF statement password patterns, inbound email alias configuration, audit logs, ZIP takeout export, Drive cleanup, session revocation, and account deletion
- **Public & Auth Surfaces**: Landing page (`/`), Auth pages (`/auth/signin`, `/auth/signout`, `/auth/verify-request`, `/auth/reset-password`), Offline fallback (`/offline`)

---

## Core Module Workflows

### 1. Documents, Folders & Camera Scanner

- **Upload & Drive Sync**: Files uploaded through `/api/documents/upload` are stored in Google Drive (`src/lib/storage/drive-provider.ts`) and indexed in PostgreSQL (`Document`, `Folder`, `Tag`, `DocumentTag`). Webhook notifications (`/api/integrations/google-drive/webhook`) and manual/periodic sync reconcile Drive changes (`StorageConnection`, `SyncEvent`).
- **Camera Perspective Scan & Append**: `CameraScanModal` + `src/lib/scanner/perspective.ts` + `src/lib/scanner/pdf-stitcher.ts` let users capture document pages, adjust corners, apply perspective rectification, export PDFs, or append new scanned pages directly to an existing PDF document via `/api/documents/[id]/append-page`.
- **AI Processing & Expiry Dates**: New/updated documents enqueue `AiJob` items processed via Gemini (`src/lib/ai/`) to generate summaries, extract structured metadata, detect document expiry/due dates (`/api/documents/[id]/dates`), and enable contextual Q&A (`DocumentQA` via `/api/documents/[id]/ai`).
- **Sharing**: Users can share folders with other registered users (`FolderShare`) or issue expiring/password-protected tokenized links (`ShareLink` at `/share/[token]`).

### 2. Credentials, 2FA Authenticator & App Lock

- **Zero-Knowledge Envelope Vault**: All secrets (`AppCredential`, `BankCredential`) are encrypted client-side before upload. Each vault maintains a salt, PBKDF2 iteration count, master password verifier, and offline recovery bundle (`PasswordVault`).
- **TOTP Authenticator**: App credentials optionally store an encrypted `totpSecret` scanned from a `otpauth://` QR code (`QRScannerModal`) or entered manually, computing live 30-second codes in `AuthenticatorCard` (`src/lib/totp.ts`).
- **App Lock**: Users can configure an optional synced App Lock PIN (`appLockPinHash`, `appLockWrappedKey` in `PasswordVault`) that locks UI access after `APP_LOCK_INACTIVITY_TIMEOUT_MS` (5 minutes) and wraps the vault key for convenient unlock across devices.

### 3. Wealth & Local Statement Decryption

- **Multi-Currency Portfolios**: Supports 8 currencies (`INR`, `USD`, `EUR`, `GBP`, `AED`, `CAD`, `AUD`, `SGD`), 13 account types (asset & liability split distinguishing `CREDIT_CARD` and `LOAN`), manual transactions, balance tracking, and duplicate account merging (`/api/wealth/accounts/[id]/merge`).
- **Statement Parser & PDF Unlocking**: Statements uploaded to `/api/wealth/statements/parse` are parsed (CSV/Excel/PDF, with Gemini fallback via `src/lib/statement-parser.ts`). Password-protected bank PDFs can be unlocked locally in the browser using `pdfjs-dist` against user-configured `PdfPasswordSettings` personal templates (`firstName`, `lastName`, `mobile`, `dateOfBirth`, `pan` via `src/lib/pdf-passwords.ts`) before transmitting extracted content.

### 4. Email Auto-Sync & Inbound Alias

- Connects **Gmail** (Google OAuth) and **Outlook** (Microsoft OAuth) plus per-user **Inbound Email Forwarding** (`inboundEmailToken` via Resend webhook `/api/webhooks/resend/inbound`).
- Multi-module AI classifier (`src/lib/sync/classify-multi-module-emails.ts`, `src/lib/sync/email-sync-engine.ts`) routes messages into three staging queues:
  - `EmailTransactionImport` (wealth transactions matched against `WealthAccount` with dedupe)
  - `EmailDocumentImport` (PDF/document attachments fetched cleanly and staged for library import)
  - `EmailReminderImport` (bills, renewals, insurance/subscription due dates staged for Reminder creation)

### 5. Family Sharing

- Owners send expiring invitations (`FAMILY_INVITATION_TTL_DAYS = 7`) toggling module access individually (`shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`, `shareNotes`).
- Accepting an invitation creates a `FamilyMembership`. For credentials, the owner wraps their credential key using the member's public key (`FamilyCredentialKey` + `PasswordVault.familyPublicKey`) so shared secrets remain end-to-end encrypted.

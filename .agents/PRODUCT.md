# Product Scope, Features & Workflows

## 1. Product Positioning & Scope

Vaulty is a private personal and family information workspace. It combines document storage, client-side encrypted credentials, a multi-currency wealth ledger, proactive reminders, family read-only sharing, and Gemini-powered document intelligence.

### What Vaulty Is NOT

- Not a commercial bank aggregator or Account Aggregator (AA) provider.
- Not a tax filing service or DigiLocker integration.
- Not an automated real-time investment market valuation ticker.
- Not an end-to-end encrypted file vault for arbitrary large media (client-side encryption covers credentials and sensitive tokens; documents are stored securely in the user's personal Google Drive).

---

## 2. Core Modules & End-to-End Workflows

### Documents & Folders

- **Supported Formats:** PDF, JPEG, PNG, WebP (up to 50 MiB by default, configurable with `MAX_UPLOAD_SIZE`).
- **Quick Camera Capture on Mobile & Multi-Page PDF Stitcher:** One-tap camera scanning via native mobile capture (`capture="environment"`), interactive 4-corner perspective crop with Heckbert projective transformation, aspect ratio presets (Free, A4, ID Card, Square), 90° rotation, document enhancement filters (High-contrast Document B&W, Grayscale, Color), multi-page scanning with page reordering and deletion, client-side PDF stitching (`pdf-lib`), and automatic client-side compression (resizing max dimension to 2048px, JPEG 0.85 quality, reducing multi-megabyte camera photos by 90-95%) before uploading directly to Google Drive.
- **Append Pages to Existing Google Drive Documents:** Document owners can append new scanned or uploaded pages directly to existing PDF or image documents via `POST /api/documents/[id]/append-page`. The backend stitches pages into the PDF on Google Drive, converts single images to multi-page PDFs when needed, updates file metadata, and automatically re-triggers Gemini AI extraction (`ensureAiJobAndProcessing`) across all pages if AI was enabled. Accessible from the document detail page action bar.
- **Hierarchical Folder Picker (`FolderTreeSelect`):** Replaces flat ASCII `<select>` elements with an interactive tree dropdown component across document upload, camera scanning, document properties/move modal, library filtering, and email sync staging. Features collapsible/expandable branches, folder depth indentation guides, quick search with auto-expanded matching branches, and path breadcrumbs.
- **Unified Command Bar & Clean Header:** Fluent command bar with flush, squared (`rounded-none`) buttons and crisp hover highlights. Single grid/list view toggle hosted in `CommandBar` `farItems`, removing duplicate header titles and view icons.
- **Storage Mapping:** Original files and AI artifacts are stored in Google Drive under `Vaulty/Docs`, `Summary`, `Interpretation`, and `Text`.
- **Library Scoping:** The document library (`/documents/library`) displays only the user's owned vault documents to match Dashboard statistics ("X files in your vault"). Family documents are explored via `/family`.
- **Viewer & Interaction:** Preview with auto-fit width, page-fit, jump-to-page, and fullscreen overlay. List view provides direct hover quick actions (Download, View Details). In-document client caching preserves viewer DOM state across tabs (Preview, Summary, Interpretation, Text).
- **In-Document Q&A:** Interactive panel grounded strictly on extracted document text via Gemini.
- **Sharing:** Public share links support optional passwords (live requirements meter, generator), expiration dates, maximum view limits, and HMAC-SHA256 signed session cookies. Folder sharing grants read-only access to direct recipients and cascades to nested subfolders.

### Document AI & Date Extraction Workflow

1. User uploads a document with `generateAi` enabled (default) or triggers processing on an existing document.
2. `AiJob` is queued in PostgreSQL with status `QUEUED`.
3. Background worker (`yarn ai:worker` or `/api/cron/ai-worker`) claims jobs using PostgreSQL row-level `SKIP LOCKED`.
4. Worker fetches file binary from Google Drive, invokes Gemini with structured extraction prompts, and saves `.txt` and `.md` artifacts in Google Drive.
5. Structured extraction results are saved to `AiProcessing.extractedMetadata`.
6. **Date Extraction Rules:**
   - Populates `Document.expiryDate` only if confidence $\ge 0.85$, supporting evidence is cited, and the document's manual expiry date is currently empty. Existing manual dates are never overwritten.
   - High-confidence important dates (e.g. premium due, policy renewal, subscription end) automatically create deduplicated `Reminder` records.
   - Lower-confidence dates remain staged on the document detail page for manual user review and one-click correction.

### Credential Vault & App Lock Workflow

1. New user has an unconfigured `PasswordVault`.
2. User sets a master password; browser derives KEK (PBKDF2-HMAC-SHA256, 600,000 iterations) and encrypts credentials with version 2 AES-256-GCM envelope encryption.
3. Dedicated routes and tabs:
   - `/credentials`: Overview with 3 dedicated tabs: **App Pass**, **Bank Pass**, and **Authenticator**.
   - `/credentials/account`: App login credentials.
   - `/credentials/bank`: Bank and financial credentials.
4. **Two-Factor Authenticator (2FA / TOTP):**
   - Microsoft/Google Authenticator style 2-step verification codes with animated 30s countdown timer and live 6-digit TOTP codes.
   - QR code scanner modal supporting live camera stream, uploaded QR images (`jsQR`), and manual Base32 secret key entry.
   - Computes standard RFC 6238 TOTP using Web Crypto API (`HMAC-SHA1`).
   - TOTP secret stored in `AppCredential.totpSecret`, protected under client-side envelope encryption with user's master password.
   - Excluded from family sharing for zero-trust credential security.
5. **Brute-Force Lockout Protection:**
   - Both `/api/passwords/unlock` and `/api/passwords/change-master-password` track failed attempts.
   - After 5 consecutive failed attempts (`MAX_FAILED_ATTEMPTS`), the vault is locked for 15 minutes (`LOCK_DURATION_MINUTES`).
   - Failed attempts log `MASTER_PASSWORD_CHANGE_FAILED` or `VAULT_UNLOCK_FAILED` in `PasswordAuditLog`.
6. **App Lock Convenience & Cross-Device PIN Sync:**
   - Setting a 4-digit PIN syncs `sha256(pin)` and an AES-GCM wrapped vault key to `PasswordVault` (`appLockPinHash`, `appLockWrappedKey`) via `/api/user/app-lock`.
   - Entering the PIN on any device unlocks App Lock and transparently un-wraps the credential vault without requiring master password re-entry.
   - **Session Grace Period:** App Lock maintains `LAST_ACTIVE_KEY` in `sessionStorage` with a 5-minute inactivity window. Hard reloads and brief tab switching preserve unlocked state.
7. **Zero-Knowledge Recovery Re-Keying:**
   - Populated vaults require the offline recovery key and security answers to reset a forgotten master password (`POST /api/passwords/recovery/rekey`). The browser unwraps the KEK, decrypts existing credentials in memory, re-encrypts with a new master password, and commits atomically.
   - Recovery routes (`/api/passwords/recovery/verify`, `/api/passwords/recovery/rekey`) are token-gated by the emailed reset token, allowing recovery even if an active web session is not present.
   - Unconfigured vaults block resets to prevent catastrophic data loss.
8. **Input Validation:**
   - Credential creation and updates enforce strict Zod schemas with character caps (envelope ciphertext capped at 100,000 characters).

### Notes & Checklists

- **Tri-Mode Canvas (`NoteEditor`):**
  - **Rich Text Mode:** Powered by TipTap, supporting Bold, Italic, Strikethrough, Highlight (yellow marker), Headings (H1, H2, H3), Bulleted (`<ul>`) and Numbered (`<ol>`) lists, Blockquotes, Tables, and Dividing lines (`<hr>`).
  - **Markdown Mode:** Direct raw Markdown source editing in a monospaced editor with keyboard shortcuts (`Ctrl+B`, `Ctrl+I`, `Tab` indentation).
  - **Preview Mode (`NoteMarkdown`):** Rendered GFM view using `react-markdown` with support for `data:image/*` and `blob:*` image previewing, responsive image scaling, and clickable outbound links.
- **Interactive Checkboxes & To-Do Lists:**
  - Configured with `@tiptap/extension-task-list` and `@tiptap/extension-task-item`.
  - CSS flex alignment (`display: flex !important; flex-direction: row !important; align-items: flex-start !important;`) ensures checkboxes and text always appear on the exact same row.
  - Paragraph margins inside task items are normalized to zero to prevent vertical misalignment.
- **List Marker Guarantees:**
  - Explicit list-style restoration (`list-style-type: disc`, `decimal`, and nested markers) in both `.prose` and `.note-tiptap-body` to counteract Tailwind v4 CSS resets.
- **Images:**
  - Clipboard paste (`handleEditorPasteImage`), file drop (`handleEditorDropImage`), and image toolbar uploads.
  - Automatically converted to Base64 data URLs in markdown, rendering seamlessly in rich mode and preview mode.
- **Color Accents & Organization:** 7 color themes (Default, Teal, Blue, Purple, Emerald, Amber, Rose) and sticky top pinning.
- **Auto-Saving:** Debounced automatic background persistence to PostgreSQL (`/api/notes/[id]`) with live status indicator ("All changes saved", "Saving...", "Unsaved changes").
- **Family Sharing:** Granular `shareNotes` permission in `FamilyMembership` allows family members to view read-only pages at `/family/notes` and `/family/[ownerId]/notes`.

### Wealth Management & Multi-Currency Ledger

- **Account Types:** Savings, current, credit cards, mutual funds, stock portfolios, loans, PPF, PF, gift cards, vouchers, fixed deposits, recurring deposits, cash, other.
- **Transaction Types:** Deposits, withdrawals, purchases, sales, interest, dividends, fees, payments, refunds, transfers, adjustments.
- **Balance Invariants:**
  - `getBalanceDelta` calculates balance impact based on account type and transaction type.
  - Modifying or deleting a transaction chronologically recalculates running balances (`balanceAfter` and `currentBalance`).
  - Account detail views (`/wealth/accounts/[accountId]`) automatically refresh transaction state on mutations without manual page reloads.
- **Strict Currency Separation:** Summaries group assets, liabilities, and net worth independently by ISO currency. Mixed currencies are never summed or implicitly converted.
- **Statement Import:** Supports CSV, XLSX, and password-protected PDF bank statements.
- **Account Merging:** Any wealth account can be merged into another account of the same currency (`POST /api/wealth/accounts/[id]/merge`) inside an atomic transaction, reassigning transactions, recomputing running balances, and cleaning up the source account.

### Email Synchronization & Multi-Module Discovery Engine Workflow

1. User connects Gmail (`gmail.readonly`), Outlook (`Mail.Read`), or uses **Inbound Forwarding** (e.g. `<username>+<token>@vaulty.mnilay.com`) via Resend Inbound Webhooks without granting mailbox-wide OAuth permissions.
2. Sync runs via UI trigger at `/email-sync`, inbound webhooks (`/api/webhooks/resend/inbound`), scheduled GitHub Actions cron (`.github/workflows/email-sync-cron.yml`), background worker daemon (`yarn worker:email`), or cron endpoint (`/api/cron/email-sync`).
3. Mailbox crawler paginates through messages using cursor tokens (`syncPageToken` / `nextLink`) across financial keywords, document triggers, and due/expiry alert keywords. Subsequent runs perform incremental syncs querying only messages received after `lastSyncedAt`.
4. Multi-module email scoring and structured Gemini classification categorize emails simultaneously into three modules:
   - **Wealth Transactions:** Official bank/card alerts. High-confidence ($\ge 0.90$) matches auto-import into `WealthTransaction`; lower confidence enters review queue (`EmailTransactionImport`).
   - **Important Documents:** Scans for invoices, receipts, insurance policies, contracts, tax documents, warranties, certificates, and statements. Staged in `EmailDocumentImport` with attachment metadata, detected expiry dates, hierarchical folder picker (`FolderTreeSelect`), and 1-click import into Document Vault.
   - **Reminders & Due Dates:** Scans for upcoming bill payment due dates, subscription renewals, EMI due dates, and policy expirations. High-confidence future items auto-create active `Reminder` entries; others queue in `EmailReminderImport` for review.
5. **Dynamic Account Auto-Provisioning:** Discovered high-confidence transactions from unknown accounts auto-create a tagged `(Auto-Discovered)` wealth account with an in-app notification and an option to merge.
6. **Financial PDF Statement Attachments:** Statement PDFs are downloaded locally and decrypted using user-configured templates in `PdfPasswordSettings`. Plaintext extraction is performed in-process via `pdfjs-dist`; attachment bytes and personal passwords are never sent to Gemini.

### Reminders & Notification Center

- **Sources:** Document expiry (30, 7, 1, 0 days), Wealth account expiry (30, 7, 1, 0 days), Credit-card payment due day (7, 3, 1, 0 days), and custom recurring/one-time reminders.
- **View Toggle:** Unified inline segmented control (`[ List | Calendar ]`) in page headers toggles between list view (`/reminders`) and monthly calendar view (`/reminders/calendar-view`).
- **Processing Schedule:** Evaluated daily at 03:30 UTC via `GET /api/cron/reminders` (`vercel.json`).
- **Delivery Channels:** In-app notification center, email via Resend, and browser Web Push (`public/sw.js`).
- **Notification Center:** Unread count badges, accessible keyboard controls (`role="button"`, `tabIndex={0}`, Enter/Space keys), deterministic date formatting (`formatNotificationDate`), and `hasLoaded` state-guarded multi-row skeleton loaders preventing empty dropdown flashes.
- **Idempotency:** Stable keys (`entity:date:offset`) prevent duplicate notifications across retried cron runs.

### Family Sharing

- Owner sends an invitation to an email address selecting granular module permissions: `shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`, `shareNotes`.
- Recipient must sign in with the exact matching email to accept.
- Access is strictly read-only and verified on the server for every shared route. All family endpoints are rate-limited via `SecurityRateLimit` across distributed instances.
- Family credential sharing uses public/wrapped key material (`FamilyCredentialKey`).
- Shared family reminders (`shareReminders`) are integrated directly into the Reminders view (`/reminders`) via server-component data fetching without exposing an insecure client-side endpoint.

### Universal Search & ⌘K Omnibox

- **Full Search (`/search`):** Scored document search with 250ms debounced search-as-you-type and type/date filters.
- **⌘K Command Palette (`Cmd/Ctrl+K` or `/`):** Fast indexed queries across document titles, folders, wealth accounts, non-sensitive credential identifiers, and reminders without heavy full-text markdown scans.

### Account Takeout & Full Deletion

- **Account Takeout (`/settings` -> `/api/user/takeout`):** Generates a client-side streamed ZIP containing JSON metadata (documents, tags, wealth accounts, transactions, reminders, audit logs, encrypted credential envelopes) and binary copies of stored documents. Enforces strict limits: max 50 original files, max 50 MiB per individual document (`MAX_TAKEOUT_FILE_BYTES`), and a cumulative budget of 200 MiB (`MAX_TAKEOUT_TOTAL_BYTES`).
- **Account Deletion (`/settings` -> `DELETE /api/user/account`):** Transactional cascade wiping all database records across 20+ tables (documents, folders, AI jobs, wealth accounts, credentials, reminders, notifications, inbound attachments, connections, audit logs, verification tokens, rate limit entries), followed by Google Drive root folder deletion and OAuth token revocation.

---

## 3. Product Surfaces & Route Inventory

| Route                       | Purpose             | Key Behaviors                                                                                                              |
| :-------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | Landing page        | Marketing overview, capabilities, privacy boundaries, open vault CTA                                                       |
| `/dashboard`                | Your Space overview | Document counts, expiry alerts, wealth net worth by currency, reminders, clean command bar                                 |
| `/documents`                | Documents overview  | Recent documents, category breakdowns, upload trigger                                                                      |
| `/documents/library`        | Document library    | Owned vault documents only, single view toggle in CommandBar, FolderTreeSelect hierarchy filter, sortOrder in filterbar    |
| `/documents/[id]`           | Document detail     | Preview controls, AI summary, interpretation, extracted dates, Q&A, append-page modal                                      |
| `/folders`, `/folders/[id]` | Folders             | Hierarchical folder navigation, folder share management                                                                    |
| `/credentials`              | Credentials & 2FA   | Vault unlock, search, active tabs for App Pass, Bank Pass, and Authenticator                                               |
| `/credentials/account`      | App credentials     | Direct subroute opening App Logins tab and creation form                                                                   |
| `/credentials/bank`         | Bank credentials    | Direct subroute opening Bank Credentials tab and creation form                                                             |
| `/notes`                    | Notes & Checklists  | Flat notes canvas, TipTap rich text, raw markdown, GFM preview with data/blob image support, inline task flex alignment    |
| `/wealth`                   | Wealth overview     | Net worth by currency, asset/liability cards, quick actions                                                                |
| `/wealth/accounts`          | Wealth accounts     | Account list, filter by status/type, bulk delete, add account                                                              |
| `/wealth/accounts/[id]`     | Account detail      | Chronological transactions, running balances, account merge                                                                |
| `/wealth/transactions`      | Transactions        | Global transaction ledger, date/category filters                                                                           |
| `/wealth/statements/import` | Statement import    | CSV/XLSX/PDF statement upload, parse, and review flow                                                                      |
| `/email-sync`               | Email Sync          | Multi-module inbox automation: Gmail/Outlook connections, transactions review queue, document scan, and due date reminders |
| `/wealth/email-sync`        | Legacy redirect     | Automatically redirects to `/email-sync`                                                                                   |
| `/reminders`                | Reminders list      | Custom reminders, upcoming expiries, channel preferences                                                                   |
| `/reminders/calendar-view`  | Reminders calendar  | Monthly visual calendar of upcoming due dates and expiries                                                                 |
| `/notifications`            | Notifications       | In-app notification center, Web Push subscription toggle, skeleton loaders                                                 |
| `/family`                   | Family sharing      | Member invitations, module permissions, shared family vaults                                                               |
| `/family/notes`             | Family Notes        | Read-only notes, checklists, and pages shared by family members                                                            |
| `/shared`                   | Shared with me      | Documents and folders shared directly with the user                                                                        |
| `/search`                   | Full search         | 250ms debounced search across document metadata and text                                                                   |
| `/chat`                     | AI chat             | Grounded conversational Q&A across user's document vault                                                                   |
| `/settings`                 | Settings            | Profile, App Lock & PIN, recovery setup, Drive, PDF passwords, takeout                                                     |
| `/share/[token]`            | Public share        | Token-authenticated public document viewer with optional password/expiry                                                   |

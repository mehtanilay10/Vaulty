# Data Model

> PostgreSQL is the configured datasource. Prisma schema is `prisma/schema.prisma`; migrations are under `prisma/migrations/`. This guide summarizes the model currently implemented in the codebase. The Prisma schema is authoritative for exact fields, defaults, relations, and indexes.

## Model inventory

### Identity and authentication

- `User`: Profile, default storage provider, session version (`sessionVersion`), global reminder email/in-app and browser push preferences.
- `Account`, `Session`, `VerificationToken`: Auth.js Prisma adapter models.

### Documents and sharing

- `Folder`: Owner, optional parent for nested hierarchy, Google Drive folder mapping.
- `Document`: Owner/folder, name, MIME type, size, Drive file metadata, storage state, optional expiry date, last-opened timestamp.
- `Tag`, `DocumentTag`: Many-to-many document tags with reverse lookup index.
- `FolderShare`: Read-only folder share to another user; unique per `(folderId, sharedWithUserId)`.
- `ShareLink`: Public token, optional password hash, expiry, max views, view count, active flag.

### AI

- `AiProcessing`: Per-document state, extracted text, summary Markdown, interpretation Markdown, JSON `extractedMetadata` (document type, expiry date, important dates with confidence and evidence), model name, errors, and processing timestamps.
- `AiJob`: Queue state, attempts, availability, lock/worker heartbeat, retry/error metadata, processed via row-level `SKIP LOCKED`.

### Storage and audit

- `StorageConnection`: User's provider connection, folder IDs, encrypted OAuth tokens, expiry, and Drive watch/sync metadata.
- `SyncEvent`: Upload, download, update, rename, move, delete, import, and conflict event history.
- `AuditLog`: Document, folder, and user activity audit trail.
- `SecurityRateLimit`: PostgreSQL-backed attempt windows, action identifiers, and block timestamps.

### Wealth and statement import

- `WealthAccount`: Owner, account type/status, name, balance/currency, bank/account details, credit limit, billing cycle, credit-card due day, investment identifiers, loan details, provider, expiry date, notes/category/tags.
- `WealthTransaction`: Account, transaction type, amount/currency/date, description/reference, balance after (`balanceAfter`), category/subcategory, units/NAV, notes/attachments.
- `PdfPasswordSettings`: Per-user AES-256-GCM encrypted configuration blob storing personal PDF password values, custom tokens, and institution templates for local bank statement PDF unlocking. No plaintext personal values are stored.

### Email synchronization & discovery

- `GmailConnection`: Owner, address, encrypted refresh token, status, last sync, and Gmail page/lookback state.
- `OutlookConnection`: Owner, address, encrypted refresh token, status, last sync, and Graph page state.
- `EmailTransactionImport`: Provider message ID (`emailMessageId`), sender/subject, parsed merchant/bank/amount/currency/type/date/reference, optional auto-matched or manually selected target account, review status (`EmailTransactionImportStatus`), provider marker (`sourceProvider`: GMAIL, OUTLOOK, FORWARDING), AI confidence/reason, and import timestamps.
- `EmailDocumentImport`: Provider message ID, sender/subject, received date, detected document title, categorized document type (`INVOICE`, `RECEIPT`, `CONTRACT`, `INSURANCE_POLICY`, `TAX_DOCUMENT`, `CERTIFICATE`, `IDENTITY`, `WARRANTY`, `STATEMENT`, `OTHER`), attachment metadata (filename, mimeType, size, attachmentId), extracted summary, detected expiry date, AI confidence/reason, review status (`PENDING`, `IMPORTED`, `DISMISSED`), linked imported document ID, and timestamps.
- `EmailReminderImport`: Provider message ID, sender/subject, received date, reminder title, description, category (`PAYMENT`, `SUBSCRIPTION`, `INSURANCE`, `DOCUMENT`, `PERSONAL`), due date (`dueAt`), optional bill amount and currency, AI confidence/reason, review status (`PENDING`, `IMPORTED`, `DISMISSED`), linked imported reminder ID, and timestamps.
- `InboundEmailAttachment`: Staged binary attachments for inbound forwarded emails (`userId`, `emailMessageId`, `filename`, `mimeType`, `sizeBytes`, `data`), automatically purged when imported to Google Drive.
- `User (Inbound Forwarding)`: Inbound routing fields (`inboundEmailToken`, `inboundEmailSlug`, `inboundEmailEnabled`, `inboundAllowedSenders`) enabling address routing (e.g. `<username>+<token>@vaulty.mnilay.com`) without mailbox-wide OAuth.

### Credential vault & App Lock

- `PasswordVault`: Owner, master-password hash, KDF metadata, configured state, reset/lock fields (`failedAttempts`, `lockedUntil` for brute-force defense), recovery metadata, family public/encrypted private key, and cross-device App Lock convenience fields (`appLockPinHash`, `appLockWrappedKey`).
- `AppCredential`: Encrypted app login fields, favorite, TOTP secret (`totpSecret`), and access metadata.
- `BankCredential`: Encrypted bank credential fields, favorite, and access metadata.
- `VaultShare`: Permission-based vault sharing.
- `PasswordAuditLog`: Credential access and security event audit trail.

### Notes

- `NotePage`: User-owned flat OneNote-style note pages (`userId`, `title`, `content` text, `todos` JSON list, `images` JSON list, `color`, `isPinned`, `isArchived`, `createdAt`, `updatedAt`).

### Notifications, reminders, and push

- `Notification`: User, type, title, message, JSON-serialized metadata string, action URL, optional unique `idempotencyKey`, read state, and delivery timestamps/errors.
- `PushSubscription`: User-owned browser endpoint, encrypted P-256 public key (`p256dh`) and auth secret (`auth`) protected by a purpose-derived key from `AUTH_SECRET`. Subscriptions cascade-delete on user removal.
- `Reminder`: User, title/description/category, due timestamp, recurrence, notification day offsets, per-channel flags, completion/active state.

### Family

- `FamilyInvitation`: Owner, email, token, status, module flags (`shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`, `shareNotes`), expiry, responded timestamp.
- `FamilyMembership`: Owner, member, and module-level read-only sharing flags (`shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`, `shareNotes`).
- `FamilyCredentialKey`: Per-membership wrapped key material and version.

### AI chat

- `ChatSession`: User, title, timestamps.
- `ChatMessage`: Session, role, content, optional referenced document metadata, timestamp.

## Enums

- `StorageProvider`: `GOOGLE_DRIVE` only.
- `StorageConnectionStatus`: `CONNECTED`, `SYNCING`, `SYNCED`, `PENDING`, `FAILED`, `DISCONNECTED`, `RECONNECT_REQUIRED`.
- `DocumentStorageStatus`: `ACTIVE`, `DELETED_EXTERNALLY`, `PENDING`, `FAILED`, `CONFLICT`.
- `SyncEventStatus`: `SUCCESS`, `FAILED`, `PENDING`.
- `SyncEventOperation`: `UPLOAD`, `DOWNLOAD`, `UPDATE`, `RENAME`, `MOVE`, `DELETE`, `IMPORT`, `CONFLICT`.
- `AiStatus`: `NOT_REQUESTED`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`.
- `AiJobStatus`: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- `WealthAccountType`: `SAVINGS_ACCOUNT`, `CURRENT_ACCOUNT`, `CREDIT_CARD`, `MUTUAL_FUND`, `STOCK_PORTFOLIO`, `LOAN`, `PPF`, `PF`, `GIFT_CARD`, `VOUCHER`, `FIXED_DEPOSIT`, `RECURRING_DEPOSIT`, `CASH`, `OTHER`.
- `WealthAccountStatus`: `ACTIVE`, `INACTIVE`, `CLOSED`, `FROZEN`.
- `TransactionType`: `DEPOSIT`, `WITHDRAWAL`, `PURCHASE`, `SALE`, `INTEREST`, `DIVIDEND`, `FEE`, `PAYMENT`, `REFUND`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT`.
- `CredentialType`: `APP`, `BANK`.
- `GmailConnectionStatus`: `CONNECTED`, `RECONNECT_REQUIRED`, `DISCONNECTED` (also used by Outlook).
- `EmailTransactionImportStatus`: `PENDING`, `IMPORTED`, `DISMISSED`.
- `FamilyInvitationStatus`: `PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED`, `EXPIRED`.
- `ReminderCategory`: `DOCUMENT`, `PAYMENT`, `INSURANCE`, `SUBSCRIPTION`, `PERSONAL`.
- `ReminderRecurrence`: `NONE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`.

## Key relationships and invariants

- User-owned primary records cascade on user deletion in the schema where configured.
- A document belongs to one owner and folder; folders have recursive parent/child relationships.
- Document tags are joined through `DocumentTag`.
- AI processing is one-to-one with `Document`; AI jobs are one-to-many.
- Wealth transactions belong to one account and cascade with it; modifying transactions triggers running balance (`balanceAfter`) recalculation.
- Email connections are unique per owner; candidates are unique by `(ownerId, emailMessageId)`. Outlook and forwarding message IDs are prefixed before persistence.
- Password vault is unique per user; credential rows belong to that vault.
- Family membership is unique per `(ownerId, memberId)`; access flags live on the membership.
- Reminder and Notification are user-owned.
- Notification `idempotencyKey` is globally unique when non-null; prevents duplicate notification creation across retried cron runs.

## Performance indexes

- `WealthTransaction`: Compound index `@@index([accountId, date])` for account transaction pagination.
- `Notification`: Compound indexes `@@index([userId, read, createdAt])` and `@@index([userId, createdAt])` for instant unread feed scans.
- `DocumentTag`: Reverse index `@@index([tagId])` for document tag filtering.
- `WealthAccount`: Compound index `@@index([ownerId, status])` for active accounts querying.
- `ChatMessage`: Compound index `@@index([sessionId, createdAt])` for chat history rendering.
- `AuditLog`: Compound index `@@index([userId, createdAt])` for user audit log feeds; `documentId` uses `onDelete: SetNull` to preserve forensic audit history upon document deletion.
- `Document`: Global index `@@index([expiryDate])` for scheduled expiration alerts.
- `Reminder`: Compound index `@@index([isActive, isCompleted, dueAt])` for global scheduled reminder scans.
- `SyncEvent`: Compound index `@@index([userId, status])` for sync event status polling.
- `EmailTransactionImport`: Index `@@index([accountId])` and relation with `onDelete: SetNull` for referential integrity upon account deletion. Compound index `@@unique([ownerId, emailMessageId])`.
- `NotePage`: Compound indexes `@@index([userId, isPinned])` and `@@index([userId, updatedAt])` for notes listing, pinned filtering, and recent sorting.

## Schema change checklist

1. Update Prisma model and indexes in `prisma/schema.prisma`.
2. Create a new migration with `yarn prisma migrate dev --name <migration_name>`; do not edit applied migrations.
3. Update all affected query, select, and serialization paths in `src/lib/`.
4. Add authorization and data-retention behavior.
5. Run `yarn prisma generate`, `yarn type-check`, and `yarn test`.
6. Update this document and relevant workflow/API docs.

# Data Model

> PostgreSQL is the datasource. Prisma schema is `prisma/schema.prisma`; migrations are under `prisma/migrations/`. This guide summarizes the model currently implemented in the codebase. The Prisma schema is authoritative for exact fields, defaults, relations, and indexes.

## Model Inventory

### Identity and Authentication

- `User`: Profile, default storage provider, session version (`sessionVersion`), global reminder email/in-app and browser push preferences, inbound email forwarding configuration (`inboundEmailSlug`, `inboundEmailToken`, `inboundEmailEnabled`, `inboundAllowedSenders`).
- `Account`, `Session`, `VerificationToken`: Auth.js Prisma adapter models.

### Documents and Sharing

- `Folder`: Owner, optional parent for nested hierarchy (`parentId`), Google Drive folder mapping (`driveFolderId`).
- `Document`: Owner, optional folder (`folderId`), name, MIME type, size, Drive file metadata, storage state, optional expiry date (`expiryDate`), last-opened timestamp (`lastOpenedAt`).
- `Tag`, `DocumentTag`: Many-to-many document tags with reverse lookup index on `(tagId, documentId)`.
- `FolderShare`: Read-only folder share to another user; unique per `(folderId, sharedWithUserId)`.
- `ShareLink`: Public token (`token`), optional scrypt password hash, expiry (`expiresAt`), max views (`maxViews`), view count (`viewCount`), active flag (`isActive`).

### AI Processing

- `AiProcessing`: Per-document state (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`), extracted text (`extractedText`), summary Markdown, interpretation Markdown, JSON `extractedMetadata` (document type, expiry date, important dates with confidence and evidence), model name, errors, and processing timestamps.
- `AiJob`: Queue state, attempts, availability (`availableAt`), lock/worker heartbeat (`lockedAt`, `lockedBy`), retry/error metadata, processed via row-level `SKIP LOCKED`.

### Storage and Audit

- `StorageConnection`: User's provider connection, folder IDs (`rootFolderId`, `docsFolderId`, `summaryFolderId`, `interpretationFolderId`, `textFolderId`), encrypted OAuth tokens (`accessTokenEncrypted`, `refreshTokenEncrypted`), expiry, and Drive watch/sync metadata.
- `SyncEvent`: Upload, download, update, rename, move, delete, import, and conflict event history.
- `AuditLog`: Document, folder, and user activity audit trail.
- `SecurityRateLimit`: PostgreSQL-backed attempt windows, action identifiers, and block timestamps (`consumeSecurityAttempt`).

### Wealth and Statement Import

- `WealthAccount`: Owner, account type/status, name, balance/currency, bank/account details, credit limit, billing cycle, credit-card due day (`creditCardDueDay`), investment identifiers, loan details, provider, expiry date, notes/category/tags.
- `WealthTransaction`: Account, transaction type, amount/currency/date, description/reference, balance after (`balanceAfter`), category/subcategory, units/NAV, notes/attachments.
- `PdfPasswordSettings`: Per-user AES-256-GCM encrypted configuration blob storing personal PDF password values, custom tokens, and institution templates for local bank statement PDF unlocking.

### Email Synchronization & Discovery

- `GmailConnection`: Owner, address, encrypted refresh token, status, last sync, and Gmail page/lookback state.
- `OutlookConnection`: Owner, address, encrypted refresh token, status, last sync, and Graph page state.
- `EmailTransactionImport`: Provider message ID (`emailMessageId`), sender/subject, parsed merchant/bank/amount/currency/type/date/reference, target account matching, review status (`EmailTransactionImportStatus`: `PENDING`, `IMPORTED`, `DISMISSED`), source provider (`GMAIL`, `OUTLOOK`, `FORWARDING`), AI confidence/reason, and import timestamps.
- `EmailDocumentImport`: Provider message ID, sender/subject, received date, detected document title, categorized document type (`INVOICE`, `RECEIPT`, `CONTRACT`, `INSURANCE_POLICY`, `TAX_DOCUMENT`, `CERTIFICATE`, `IDENTITY`, `WARRANTY`, `STATEMENT`, `OTHER`), attachment metadata (filename, mimeType, size, attachmentId), extracted summary, detected expiry date, AI confidence/reason, review status (`PENDING`, `IMPORTED`, `DISMISSED`), linked imported document ID, and timestamps.
- `EmailReminderImport`: Provider message ID, sender/subject, received date, reminder title, description, category (`PAYMENT`, `SUBSCRIPTION`, `INSURANCE`, `DOCUMENT`, `PERSONAL`), due date (`dueAt`), optional bill amount and currency, AI confidence/reason, review status (`PENDING`, `IMPORTED`, `DISMISSED`), linked imported reminder ID, and timestamps.
- `InboundEmailAttachment`: Staged binary attachments for inbound forwarded emails (`userId`, `emailMessageId`, `filename`, `mimeType`, `sizeBytes`, `data`), automatically purged when imported to Google Drive.

### Credential Vault & App Lock

- `PasswordVault`: Owner, master-password hash, KDF metadata (`kdfSalt`, `kdfIterations`), configured state, reset/lock fields (`failedAttempts`, `lockedUntil` for brute-force defense), recovery metadata, family public/encrypted private key, and cross-device App Lock convenience fields (`appLockPinHash`, `appLockWrappedKey`).
- `AppCredential`: Encrypted app login fields, favorite flag, TOTP secret (`totpSecret`), and access metadata.
- `BankCredential`: Encrypted bank credential fields, favorite flag, and access metadata.
- `VaultShare`: Permission-based vault sharing.
- `PasswordAuditLog`: Credential access, unlock, reveal, and security event audit trail.

### Notes

- `NotePage`: User-owned note pages (`userId`, `title`, `content` text/markdown, `todos` JSON list, `images` JSON list, `color`, `isPinned`, `isArchived`, `createdAt`, `updatedAt`).

### Notifications, Reminders & Push

- `Reminder`: Source module (`DOCUMENT`, `CREDENTIAL`, `WEALTH`, `CUSTOM`), entity link, title, due date, status (`PENDING`, `COMPLETED`, `DISMISSED`), recurrence rule (`NONE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), notification offset days (`offsetDays`).
- `Notification`: In-app notification feed item, type (`DOCUMENT_EXPIRY`, `PAYMENT_DUE`, `ACCOUNT_EXPIRY`, `AI_COMPLETE`, `AI_FAILED`, `SYSTEM`, `SECURITY`, `FAMILY_INVITE`, `EMAIL_SYNC`), title, message, action URL, read state.
- `PushSubscription`: Browser Web Push subscription (`endpoint`, `p256dhKey`, `authKey`), encrypted under server secret.

### Family Sharing

- `FamilyMembership`: Primary owner, member, status (`PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED`), granular module flags (`shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`, `shareNotes`), invitation email, timestamps.
- `FamilyCredentialKey`: Encrypted symmetric KEK wrapped with recipient's public key for zero-knowledge credential sharing.
- `FamilyAuditLog`: Family member action log.

### Grounded AI Chat

- `ChatSession`: User, session title, timestamps.
- `ChatMessage`: Session, role (`user`, `assistant`), message content, referenced document IDs, token usage, timestamps.

---

## Performance Compound Indexes

Prisma schema maintains targeted compound indexes to eliminate full table scans across multi-tenant queries:

- `Document`: `[ownerId, createdAt]`, `[ownerId, folderId]`, `[ownerId, mimeType]`, `[ownerId, expiryDate]`
- `AiJob`: `[status, availableAt, attempts]`, `[documentId]`
- `WealthTransaction`: `[accountId, date]`, `[accountId, type]`
- `Reminder`: `[userId, status, dueDate]`
- `Notification`: `[userId, read, createdAt]`
- `NotePage`: `[userId, isPinned, updatedAt]`
- `EmailTransactionImport`: `[userId, reviewStatus, emailDate]`
- `EmailDocumentImport`: `[userId, reviewStatus, emailDate]`
- `EmailReminderImport`: `[userId, reviewStatus, emailDate]`
- `SecurityRateLimit`: `[action, key, windowStart]`

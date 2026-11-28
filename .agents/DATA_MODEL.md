# Vaulty — PostgreSQL Data Model

Schema source of truth: [`prisma/schema.prisma`](file:///d:/GitHub/Vaulty/prisma/schema.prisma) (PostgreSQL via `@prisma/client` `6.3`).

---

## Models by Domain (39 Models, 16 Enums)

### 1. Identity, Auth & Preferences

- **`User`**: Core account profile, Auth.js fields, `sessionVersion` (global session revocation), `inboundEmailToken` (per-user Resend forwarding alias), settings fields, and relations across all modules.
- **`Account`**, **`Session`**, **`VerificationToken`**: Auth.js v5 adapter models supporting OAuth and email magic links.
- **`SecurityRateLimit`**: Keyed atomic counter (`key`, `attempts`, `windowStartedAt`, `blockedUntil`) shared across serverless instances.
- **`AuditLog`**: General user security/activity audit events (`/api/user/audit-logs`).

### 2. Documents, Folders, Storage & AI

- **`Folder`**: Nested user folder tree supporting Google Drive mapping and hierarchy (`FolderTreeSelect`).
- **`Document`**: Indexed document metadata, MIME type, size, Google Drive identifiers, expiry/important dates, storage status (`DocumentStorageStatus`).
- **`ShareLink`**: Tokenized external document sharing links (`token`, optional expiry/passcode).
- **`Tag`**, **`DocumentTag`**: Many-to-many tagging system per user/document.
- **`FolderShare`**: Direct user-to-user folder sharing grants.
- **`StorageConnection`**, **`SyncEvent`**: Connected Google Drive OAuth credentials, push channel/cursor state, and sync audit history (`StorageProvider`, `StorageConnectionStatus`, `SyncEventStatus`, `SyncEventOperation`).
- **`AiProcessing`**, **`AiJob`**: Document AI processing state, summaries, extracted metadata, and asynchronous worker job queue (`AiStatus`, `AiJobStatus`).
- **`ChatSession`**, **`ChatMessage`**: Persistent AI Chat conversations and ordered messages.

### 3. Wealth & Statement Imports

- **`WealthAccount`**: User accounts across 13 `WealthAccountType` variants (`SAVINGS`, `CHECKING`, `CREDIT_CARD`, `INVESTMENT`, `FIXED_DEPOSIT`, `RECURRING_DEPOSIT`, `PROVIDENT_FUND`, `REAL_ESTATE`, `GOLD`, `CRYPTO`, `LOAN`, `INSURANCE`, `OTHER`), 4 `WealthAccountStatus` values (`ACTIVE`, `INACTIVE`, `CLOSED`, `FROZEN`), currency, and balance metadata.
- **`WealthTransaction`**: Ledger entries categorized by 10 `TransactionType` values (`INCOME`, `EXPENSE`, `TRANSFER`, `INVESTMENT_BUY`, `INVESTMENT_SELL`, `DIVIDEND`, `INTEREST`, `FEE`, `TAX`, `ADJUSTMENT`).
- **`PdfPasswordSettings`**: Per-user encrypted personal template configuration (`encryptedConfig`) for client-side PDF statement decryption.

### 4. Email Connections & Auto-Sync Staging Queues

- **`GmailConnection`**: Google Gmail OAuth tokens, sync cursor, and `GmailConnectionStatus`.
- **`OutlookConnection`**: Microsoft Outlook OAuth tokens and sync state.
- **`EmailTransactionImport`**: Parsed candidate financial transactions staged from email with dedupe and `EmailTransactionImportStatus`.
- **`EmailDocumentImport`**: Detected email document attachments staged for library import.
- **`EmailReminderImport`**: Extracted due dates/bills staged for one-click reminder creation (`ownerId`, `emailMessageId`, `sourceProvider`, `title`, `category`, `dueAt`, `amount`, `currency`, `aiConfidence`, `status`, `importedReminderId`; unique on `[ownerId, emailMessageId]`).
- **`InboundEmailAttachment`**: Temporarily persisted attachment bytes (`data: Bytes`, `sizeBytes`, `mimeType`) received via Resend inbound webhook until imported or cleaned up.

### 5. Credentials Vault & App Lock

- **`PasswordVault`**: 1:1 with `User` (`userId` unique). Stores `masterPasswordHash`, `encryptionSalt`, `kdfIterations`, `failedAttempts`, `lockedUntil`, `resetToken`, offline recovery fields (`recoveryKeyId`, `recoveryKeyHash`, `recoveryEncryptedKEK`, `recoverySalt`, `recoveryIv`, `recoveryKdfIterations`, `recoveryQuestions`), family keys (`familyPublicKey`, `familyEncryptedPrivateKey`, `familyPrivateKeyIv`, `familyKeyUpdatedAt`), and cross-device App Lock (`appLockPinHash`, `appLockWrappedKey`).
- **`AppCredential`**: Encrypted login records (`name`, `url`, `username`, `password`, optional `totpSecret`, `isFavorite`, `lastAccessedAt`, `icon`, `iconColor`), indexed on `[vaultId]`, `[isFavorite]`, and `[vaultId, isFavorite]`.
- **`BankCredential`**: Encrypted banking secrets (`name`, `username`, `netbankPassword`, `atmPin`, `upiPin`, `mobileAppPin`, `mobileTransactionPin`, `isFavorite`, `lastAccessedAt`, `icon`, `iconColor`), indexed on `[vaultId]`, `[isFavorite]`, and `[vaultId, isFavorite]`.
- **`VaultShare`**: Legacy/direct credential vault sharing grants (`vaultId`, `sharedWithId`, `sharedById`, `permission`).
- **`PasswordAuditLog`**: Vault-scoped security events (`action`, `credentialType`, `credentialId`, `ipAddress`, `userAgent`).

### 6. Family Sharing

- **`FamilyInvitation`**: Owner email invitations (`token`, `status: FamilyInvitationStatus` [`PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED`, `EXPIRED`], per-module booleans `shareDocuments`, `shareWealth`, `shareCredentials`, `shareReminders`, `shareNotes`, `expiresAt`), unique on `[ownerId, email]`.
- **`FamilyMembership`**: Active family link (`ownerId`, `memberId`) with live per-module flags, unique on `[ownerId, memberId]`.
- **`FamilyCredentialKey`**: Stores `wrappedKey` and `keyVersion` 1:1 with `FamilyMembership` (`membershipId` unique) for sharing encrypted vaults.

### 7. Notes, Reminders & Notifications

- **`NotePage`**: Flexible note record (`title`, `content` text/Markdown, `todos` JSON, `images` JSON, `color`, `isPinned`, `isArchived`), indexed on `[userId, isPinned]` and `[userId, updatedAt]`.
- **`Reminder`**: Scheduled alert (`title`, `description`, `category: ReminderCategory` [`DOCUMENT`, `PAYMENT`, `INSURANCE`, `SUBSCRIPTION`, `PERSONAL`], `dueAt`, `recurrence: ReminderRecurrence` [`NONE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`], `notifyDaysBefore: Int[]`, `notifyInApp`, `notifyByEmail`, `isCompleted`, `isActive`), indexed on `[userId, dueAt, isActive]`, `[userId, isCompleted]`, and `[isActive, isCompleted, dueAt]`.
- **`Notification`**: In-app notification inbox with deduplication (`idempotencyKey` unique) and email/push delivery status (`emailSentAt`, `emailLastError`, `pushSentAt`, `pushLastError`), compound-indexed on `[userId, read, createdAt]`.
- **`PushSubscription`**: Web Push endpoints (`endpoint` unique, `p256dh`, `auth`, `userAgent`) indexed by `userId`.

---

## Enums Summary (16)

| Category           | Enums                                                                                                          |
| :----------------- | :------------------------------------------------------------------------------------------------------------- |
| **Storage & Sync** | `StorageProvider`, `StorageConnectionStatus`, `DocumentStorageStatus`, `SyncEventStatus`, `SyncEventOperation` |
| **AI**             | `AiStatus`, `AiJobStatus`                                                                                      |
| **Wealth**         | `WealthAccountType`, `WealthAccountStatus`, `TransactionType`                                                  |
| **Credentials**    | `CredentialType`                                                                                               |
| **Email Sync**     | `GmailConnectionStatus`, `EmailTransactionImportStatus`                                                        |
| **Family**         | `FamilyInvitationStatus`                                                                                       |
| **Reminders**      | `ReminderCategory`, `ReminderRecurrence`                                                                       |

---

## Migration Guidelines

- Always modify `prisma/schema.prisma`, then run `yarn db:migrate` (or `yarn prisma migrate dev`) to create a timestamped migration in `prisma/migrations/`.
- Keep schema edits backward-compatible where zero-downtime deployments matter.
- Update this file whenever models, relations, indexes, or enums change.

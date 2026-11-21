-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "StorageConnectionStatus" AS ENUM ('CONNECTED', 'SYNCING', 'SYNCED', 'PENDING', 'FAILED', 'DISCONNECTED', 'RECONNECT_REQUIRED');

-- CreateEnum
CREATE TYPE "DocumentStorageStatus" AS ENUM ('ACTIVE', 'DELETED_EXTERNALLY', 'PENDING', 'FAILED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "SyncEventStatus" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "SyncEventOperation" AS ENUM ('UPLOAD', 'DOWNLOAD', 'UPDATE', 'RENAME', 'MOVE', 'DELETE', 'IMPORT', 'CONFLICT');

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('NOT_REQUESTED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WealthAccountType" AS ENUM ('SAVINGS_ACCOUNT', 'CURRENT_ACCOUNT', 'CREDIT_CARD', 'MUTUAL_FUND', 'STOCK_PORTFOLIO', 'LOAN', 'PPF', 'PF', 'GIFT_CARD', 'VOUCHER', 'FIXED_DEPOSIT', 'RECURRING_DEPOSIT', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "WealthAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED', 'FROZEN');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'PURCHASE', 'SALE', 'INTEREST', 'DIVIDEND', 'FEE', 'PAYMENT', 'REFUND', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('APP', 'BANK');

-- CreateEnum
CREATE TYPE "GmailConnectionStatus" AS ENUM ('CONNECTED', 'RECONNECT_REQUIRED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "EmailTransactionImportStatus" AS ENUM ('PENDING', 'IMPORTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FamilyInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReminderCategory" AS ENUM ('DOCUMENT', 'PAYMENT', 'INSURANCE', 'SUBSCRIPTION', 'PERSONAL');

-- CreateEnum
CREATE TYPE "ReminderRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "defaultStorageProvider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "reminderEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderInAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inboundEmailToken" VARCHAR(64),
    "inboundEmailSlug" VARCHAR(64),
    "inboundEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inboundAllowedSenders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "parentId" TEXT,
    "storageProvider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "storageFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "folderId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "storageFileId" TEXT,
    "storageParentId" TEXT,
    "storageModifiedAt" TIMESTAMP(3),
    "storageChecksum" TEXT,
    "storageVersion" TEXT,
    "storageWebViewLink" TEXT,
    "storageStatus" "DocumentStorageStatus" NOT NULL DEFAULT 'ACTIVE',
    "googleDriveSummaryFileId" TEXT,
    "googleDriveTextFileId" TEXT,
    "googleDriveInterpretationFileId" TEXT,
    "expiryDate" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "password" TEXT,
    "expiresAt" TIMESTAMP(3),
    "maxViews" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTag" (
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("documentId","tagId")
);

-- CreateTable
CREATE TABLE "FolderShare" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "sharedWithUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'READ_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProcessing" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "AiStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "extractedText" TEXT,
    "summaryMarkdown" TEXT,
    "interpretationMarkdown" TEXT,
    "extractedMetadata" JSONB,
    "errorMessage" TEXT,
    "modelUsed" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProcessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastError" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "folderId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "status" "StorageConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "rootFolderId" TEXT,
    "docsFolderId" TEXT,
    "summaryFolderId" TEXT,
    "textFolderId" TEXT,
    "interpretationFolderId" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "pageToken" TEXT,
    "channelId" TEXT,
    "channelResourceId" TEXT,
    "channelExpiration" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "StorageProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "documentId" TEXT,
    "folderId" TEXT,
    "operation" "SyncEventOperation" NOT NULL,
    "status" "SyncEventStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "connectionId" TEXT,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "referencedDocs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WealthAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WealthAccountType" NOT NULL,
    "status" "WealthAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "accountNumber" TEXT,
    "bankName" TEXT,
    "branchName" TEXT,
    "currentBalance" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "creditLimit" DECIMAL(18,2),
    "billingCycle" TEXT,
    "dueDate" INTEGER,
    "isin" TEXT,
    "broker" TEXT,
    "dematAccount" TEXT,
    "loanType" TEXT,
    "interestRate" DECIMAL(5,2),
    "emiAmount" DECIMAL(18,2),
    "tenureMonths" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "provider" TEXT,
    "expiryDate" TIMESTAMP(3),
    "pin" TEXT,
    "notes" TEXT,
    "category" TEXT,
    "tags" TEXT[],
    "paymentNotifyDaysBefore" INTEGER[] DEFAULT ARRAY[7, 3, 1, 0]::INTEGER[],
    "expiryNotifyDaysBefore" INTEGER[] DEFAULT ARRAY[30, 7, 1, 0]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WealthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WealthTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "units" DECIMAL(18,4),
    "navPrice" DECIMAL(18,4),
    "notes" TEXT,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WealthTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "status" "GmailConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "syncPageToken" TEXT,
    "syncLookbackDays" INTEGER,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutlookConnection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "status" "GmailConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "syncPageToken" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutlookConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTransactionImport" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "fromAddress" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(500),
    "bankName" VARCHAR(120),
    "merchant" VARCHAR(180),
    "description" VARCHAR(240) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "type" "TransactionType" NOT NULL,
    "referenceNumber" VARCHAR(80),
    "date" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT,
    "status" "EmailTransactionImportStatus" NOT NULL DEFAULT 'PENDING',
    "sourceProvider" VARCHAR(16) NOT NULL DEFAULT 'GMAIL',
    "aiConfidence" DOUBLE PRECISION,
    "aiReason" TEXT,
    "aiClassifiedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTransactionImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDocumentImport" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "sourceProvider" VARCHAR(16) NOT NULL DEFAULT 'GMAIL',
    "fromAddress" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(500),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "documentTitle" VARCHAR(240) NOT NULL,
    "documentType" VARCHAR(80) NOT NULL DEFAULT 'OTHER',
    "filename" VARCHAR(255),
    "mimeType" VARCHAR(128),
    "fileSizeBytes" INTEGER DEFAULT 0,
    "attachmentId" VARCHAR(255),
    "extractedSummary" TEXT,
    "expiryDate" TIMESTAMP(3),
    "aiConfidence" DOUBLE PRECISION,
    "aiReason" TEXT,
    "status" "EmailTransactionImportStatus" NOT NULL DEFAULT 'PENDING',
    "importedDocumentId" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDocumentImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailReminderImport" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "sourceProvider" VARCHAR(16) NOT NULL DEFAULT 'GMAIL',
    "fromAddress" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(500),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "category" "ReminderCategory" NOT NULL DEFAULT 'PERSONAL',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" VARCHAR(3) DEFAULT 'INR',
    "aiConfidence" DOUBLE PRECISION,
    "aiReason" TEXT,
    "status" "EmailTransactionImportStatus" NOT NULL DEFAULT 'PENDING',
    "importedReminderId" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailReminderImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEmailAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailMessageId" VARCHAR(255) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordVault" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "masterPasswordHash" TEXT,
    "encryptionSalt" TEXT,
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "kdfIterations" INTEGER NOT NULL DEFAULT 100000,
    "resetToken" TEXT,
    "resetTokenExpires" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "recoveryKeyId" TEXT,
    "recoveryKeyHash" TEXT,
    "recoveryEncryptedKEK" TEXT,
    "recoverySalt" TEXT,
    "recoveryIv" TEXT,
    "recoveryKdfIterations" INTEGER NOT NULL DEFAULT 100000,
    "recoveryQuestions" TEXT,
    "familyPublicKey" TEXT,
    "familyEncryptedPrivateKey" TEXT,
    "familyPrivateKeyIv" TEXT,
    "familyKeyUpdatedAt" TIMESTAMP(3),
    "appLockPinHash" TEXT,
    "appLockWrappedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordVault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppCredential" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "lastAccessedAt" TIMESTAMP(3),
    "icon" TEXT,
    "iconColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankCredential" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "netbankPassword" TEXT,
    "atmPin" TEXT,
    "upiPin" TEXT,
    "mobileAppPin" TEXT,
    "mobileTransactionPin" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "lastAccessedAt" TIMESTAMP(3),
    "icon" TEXT,
    "iconColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultShare" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'READ_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordAuditLog" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "credentialType" TEXT,
    "credentialId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT,
    "actionUrl" TEXT,
    "idempotencyKey" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "emailLastError" TEXT,
    "pushSentAt" TIMESTAMP(3),
    "pushLastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyInvitation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "FamilyInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "shareDocuments" BOOLEAN NOT NULL DEFAULT false,
    "shareWealth" BOOLEAN NOT NULL DEFAULT false,
    "shareCredentials" BOOLEAN NOT NULL DEFAULT false,
    "shareReminders" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMembership" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "shareDocuments" BOOLEAN NOT NULL DEFAULT false,
    "shareWealth" BOOLEAN NOT NULL DEFAULT false,
    "shareCredentials" BOOLEAN NOT NULL DEFAULT false,
    "shareReminders" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyCredentialKey" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyCredentialKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityRateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ReminderCategory" NOT NULL DEFAULT 'PERSONAL',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "recurrence" "ReminderRecurrence" NOT NULL DEFAULT 'NONE',
    "notifyDaysBefore" INTEGER[] DEFAULT ARRAY[7, 1, 0]::INTEGER[],
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfPasswordSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfPasswordSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_inboundEmailToken_key" ON "User"("inboundEmailToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_inboundEmailSlug_key" ON "User"("inboundEmailSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Folder_ownerId_idx" ON "Folder"("ownerId");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "Folder_storageFolderId_idx" ON "Folder"("storageFolderId");

-- CreateIndex
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");

-- CreateIndex
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- CreateIndex
CREATE INDEX "Document_storageFileId_idx" ON "Document"("storageFileId");

-- CreateIndex
CREATE INDEX "Document_ownerId_lastOpenedAt_idx" ON "Document"("ownerId", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "Document_ownerId_expiryDate_idx" ON "Document"("ownerId", "expiryDate");

-- CreateIndex
CREATE INDEX "Document_expiryDate_idx" ON "Document"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_token_idx" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_documentId_idx" ON "ShareLink"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "DocumentTag_tagId_idx" ON "DocumentTag"("tagId");

-- CreateIndex
CREATE INDEX "FolderShare_sharedWithUserId_idx" ON "FolderShare"("sharedWithUserId");

-- CreateIndex
CREATE INDEX "FolderShare_folderId_idx" ON "FolderShare"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "FolderShare_folderId_sharedWithUserId_key" ON "FolderShare"("folderId", "sharedWithUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AiProcessing_documentId_key" ON "AiProcessing"("documentId");

-- CreateIndex
CREATE INDEX "AiJob_status_availableAt_idx" ON "AiJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AiJob_documentId_idx" ON "AiJob"("documentId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StorageConnection_userId_idx" ON "StorageConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageConnection_userId_provider_key" ON "StorageConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "SyncEvent_userId_idx" ON "SyncEvent"("userId");

-- CreateIndex
CREATE INDEX "SyncEvent_userId_status_idx" ON "SyncEvent"("userId", "status");

-- CreateIndex
CREATE INDEX "SyncEvent_documentId_idx" ON "SyncEvent"("documentId");

-- CreateIndex
CREATE INDEX "SyncEvent_createdAt_idx" ON "SyncEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_userId_idx" ON "ChatSession"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "WealthAccount_ownerId_idx" ON "WealthAccount"("ownerId");

-- CreateIndex
CREATE INDEX "WealthAccount_ownerId_status_idx" ON "WealthAccount"("ownerId", "status");

-- CreateIndex
CREATE INDEX "WealthAccount_type_idx" ON "WealthAccount"("type");

-- CreateIndex
CREATE INDEX "WealthAccount_status_idx" ON "WealthAccount"("status");

-- CreateIndex
CREATE INDEX "WealthTransaction_accountId_idx" ON "WealthTransaction"("accountId");

-- CreateIndex
CREATE INDEX "WealthTransaction_accountId_date_idx" ON "WealthTransaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "WealthTransaction_date_idx" ON "WealthTransaction"("date");

-- CreateIndex
CREATE INDEX "WealthTransaction_type_idx" ON "WealthTransaction"("type");

-- CreateIndex
CREATE UNIQUE INDEX "GmailConnection_ownerId_key" ON "GmailConnection"("ownerId");

-- CreateIndex
CREATE INDEX "GmailConnection_status_idx" ON "GmailConnection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OutlookConnection_ownerId_key" ON "OutlookConnection"("ownerId");

-- CreateIndex
CREATE INDEX "OutlookConnection_status_idx" ON "OutlookConnection"("status");

-- CreateIndex
CREATE INDEX "EmailTransactionImport_ownerId_status_date_idx" ON "EmailTransactionImport"("ownerId", "status", "date");

-- CreateIndex
CREATE INDEX "EmailTransactionImport_ownerId_sourceProvider_status_date_idx" ON "EmailTransactionImport"("ownerId", "sourceProvider", "status", "date");

-- CreateIndex
CREATE INDEX "EmailTransactionImport_ownerId_createdAt_idx" ON "EmailTransactionImport"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailTransactionImport_accountId_idx" ON "EmailTransactionImport"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTransactionImport_ownerId_emailMessageId_key" ON "EmailTransactionImport"("ownerId", "emailMessageId");

-- CreateIndex
CREATE INDEX "EmailDocumentImport_ownerId_status_receivedAt_idx" ON "EmailDocumentImport"("ownerId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailDocumentImport_ownerId_sourceProvider_status_idx" ON "EmailDocumentImport"("ownerId", "sourceProvider", "status");

-- CreateIndex
CREATE INDEX "EmailDocumentImport_ownerId_createdAt_idx" ON "EmailDocumentImport"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDocumentImport_ownerId_emailMessageId_key" ON "EmailDocumentImport"("ownerId", "emailMessageId");

-- CreateIndex
CREATE INDEX "EmailReminderImport_ownerId_status_dueAt_idx" ON "EmailReminderImport"("ownerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "EmailReminderImport_ownerId_sourceProvider_status_idx" ON "EmailReminderImport"("ownerId", "sourceProvider", "status");

-- CreateIndex
CREATE INDEX "EmailReminderImport_ownerId_createdAt_idx" ON "EmailReminderImport"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailReminderImport_ownerId_emailMessageId_key" ON "EmailReminderImport"("ownerId", "emailMessageId");

-- CreateIndex
CREATE INDEX "InboundEmailAttachment_userId_emailMessageId_idx" ON "InboundEmailAttachment"("userId", "emailMessageId");

-- CreateIndex
CREATE INDEX "InboundEmailAttachment_createdAt_idx" ON "InboundEmailAttachment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordVault_userId_key" ON "PasswordVault"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordVault_resetToken_key" ON "PasswordVault"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordVault_recoveryKeyId_key" ON "PasswordVault"("recoveryKeyId");

-- CreateIndex
CREATE INDEX "PasswordVault_userId_idx" ON "PasswordVault"("userId");

-- CreateIndex
CREATE INDEX "PasswordVault_resetToken_idx" ON "PasswordVault"("resetToken");

-- CreateIndex
CREATE INDEX "AppCredential_vaultId_idx" ON "AppCredential"("vaultId");

-- CreateIndex
CREATE INDEX "AppCredential_isFavorite_idx" ON "AppCredential"("isFavorite");

-- CreateIndex
CREATE INDEX "AppCredential_vaultId_isFavorite_idx" ON "AppCredential"("vaultId", "isFavorite");

-- CreateIndex
CREATE INDEX "BankCredential_vaultId_idx" ON "BankCredential"("vaultId");

-- CreateIndex
CREATE INDEX "BankCredential_isFavorite_idx" ON "BankCredential"("isFavorite");

-- CreateIndex
CREATE INDEX "BankCredential_vaultId_isFavorite_idx" ON "BankCredential"("vaultId", "isFavorite");

-- CreateIndex
CREATE INDEX "VaultShare_vaultId_idx" ON "VaultShare"("vaultId");

-- CreateIndex
CREATE INDEX "VaultShare_sharedWithId_idx" ON "VaultShare"("sharedWithId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultShare_vaultId_sharedWithId_key" ON "VaultShare"("vaultId", "sharedWithId");

-- CreateIndex
CREATE INDEX "PasswordAuditLog_vaultId_idx" ON "PasswordAuditLog"("vaultId");

-- CreateIndex
CREATE INDEX "PasswordAuditLog_createdAt_idx" ON "PasswordAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "PasswordAuditLog_credentialId_idx" ON "PasswordAuditLog"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyInvitation_token_key" ON "FamilyInvitation"("token");

-- CreateIndex
CREATE INDEX "FamilyInvitation_ownerId_idx" ON "FamilyInvitation"("ownerId");

-- CreateIndex
CREATE INDEX "FamilyInvitation_email_idx" ON "FamilyInvitation"("email");

-- CreateIndex
CREATE INDEX "FamilyInvitation_status_idx" ON "FamilyInvitation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyInvitation_ownerId_email_key" ON "FamilyInvitation"("ownerId", "email");

-- CreateIndex
CREATE INDEX "FamilyMembership_ownerId_idx" ON "FamilyMembership"("ownerId");

-- CreateIndex
CREATE INDEX "FamilyMembership_memberId_idx" ON "FamilyMembership"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyMembership_ownerId_memberId_key" ON "FamilyMembership"("ownerId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyCredentialKey_membershipId_key" ON "FamilyCredentialKey"("membershipId");

-- CreateIndex
CREATE INDEX "FamilyCredentialKey_ownerId_idx" ON "FamilyCredentialKey"("ownerId");

-- CreateIndex
CREATE INDEX "FamilyCredentialKey_memberId_idx" ON "FamilyCredentialKey"("memberId");

-- CreateIndex
CREATE INDEX "SecurityRateLimit_blockedUntil_idx" ON "SecurityRateLimit"("blockedUntil");

-- CreateIndex
CREATE INDEX "Reminder_userId_dueAt_isActive_idx" ON "Reminder"("userId", "dueAt", "isActive");

-- CreateIndex
CREATE INDEX "Reminder_userId_isCompleted_idx" ON "Reminder"("userId", "isCompleted");

-- CreateIndex
CREATE INDEX "Reminder_isActive_isCompleted_dueAt_idx" ON "Reminder"("isActive", "isCompleted", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PdfPasswordSettings_userId_key" ON "PdfPasswordSettings"("userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProcessing" ADD CONSTRAINT "AiProcessing_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageConnection" ADD CONSTRAINT "StorageConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "StorageConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WealthAccount" ADD CONSTRAINT "WealthAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WealthTransaction" ADD CONSTRAINT "WealthTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WealthAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlookConnection" ADD CONSTRAINT "OutlookConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTransactionImport" ADD CONSTRAINT "EmailTransactionImport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTransactionImport" ADD CONSTRAINT "EmailTransactionImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WealthAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDocumentImport" ADD CONSTRAINT "EmailDocumentImport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReminderImport" ADD CONSTRAINT "EmailReminderImport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmailAttachment" ADD CONSTRAINT "InboundEmailAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordVault" ADD CONSTRAINT "PasswordVault_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCredential" ADD CONSTRAINT "AppCredential_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "PasswordVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankCredential" ADD CONSTRAINT "BankCredential_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "PasswordVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultShare" ADD CONSTRAINT "VaultShare_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "PasswordVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultShare" ADD CONSTRAINT "VaultShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultShare" ADD CONSTRAINT "VaultShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordAuditLog" ADD CONSTRAINT "PasswordAuditLog_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "PasswordVault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyInvitation" ADD CONSTRAINT "FamilyInvitation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMembership" ADD CONSTRAINT "FamilyMembership_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMembership" ADD CONSTRAINT "FamilyMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyCredentialKey" ADD CONSTRAINT "FamilyCredentialKey_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "FamilyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfPasswordSettings" ADD CONSTRAINT "PdfPasswordSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


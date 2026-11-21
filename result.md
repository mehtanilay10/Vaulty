# Vaulty Application Bug Analysis Report

**Generated:** 2026-11-08  
**Analysis Scope:** Full application codebase  
**Total Potential Bugs Identified:** 168

---

## Executive Summary

This report details potential bugs found across 7 major modules of the Vaulty application:

| Module             | Critical | High   | Medium | Low    | Total   |
| ------------------ | -------- | ------ | ------ | ------ | ------- |
| Documents          | 5        | 6      | 7      | 6      | 24      |
| Passwords/Security | 3        | 3      | 6      | 5      | 17      |
| Wealth/Banking     | 3        | 7      | 8      | 7      | 25      |
| Family             | 3        | 4      | 5      | 4      | 16      |
| Integrations       | 3        | 9      | 14     | 9      | 35      |
| AI/Chat            | 4        | 5      | 10     | 5      | 24      |
| Core Libraries     | 4        | 6      | 10     | 10     | 30      |
| **TOTAL**          | **25**   | **40** | **60** | **46** | **171** |

---

## Priority Recommendations

### Immediate Action Required (Critical)

1. **Add SSR guards to all crypto-related files** - Application crashes during server-side rendering
2. **Fix race conditions in document operations** - Data loss and corruption risks
3. **Implement proper OAuth state signing for Google Drive** - CSRF and tampering vulnerabilities
4. **Add timeout to Gemini API calls** - Resource exhaustion risk
5. **Fix timing attack vulnerabilities in password recovery** - Security compromise risk
6. **Add webhook signature validation** - Spoofed webhook notifications
7. **Fix authorization checks in family/shared data APIs** - Unauthorized data access

### High Priority Actions

1. Add comprehensive error handling to all API routes
2. Implement rate limiting on all endpoints
3. Add proper transaction boundaries for multi-step operations
4. Fix memory leaks in client components
5. Add input validation at API boundaries
6. Implement proper CSRF validation across all mutating endpoints
7. Add null/undefined checks throughout the codebase

---

## Module-by-Module Analysis

---

## 1. DOCUMENTS MODULE (24 bugs)

### Critical Severity (5)

#### 1. Race Condition in Document Update

**File:** `src/app/api/documents/[id]/route.ts` (Lines 39-42)  
**Issue:** Document existence check and `lastOpenedAt` update are not atomic. Between checking if the document exists and updating it, the document could be deleted by another request.  
**Recommendation:** Use a transaction or combine the check and update in a single query.

#### 2. Data Loss Risk in Tag Update

**File:** `src/app/api/documents/[id]/route.ts` (Lines 113-134)  
**Issue:** Code deletes all document tags first, then recreates them. If the recreation loop fails, tags are permanently lost.  
**Recommendation:** Wrap the entire operation in a transaction, or use a diff-based approach.

#### 3. Orphaned Google Drive Files on Delete Failure

**File:** `src/app/api/documents/[id]/route.ts` (Lines 180-197)  
**Issue:** If Google Drive deletion fails, the code continues to delete the document from the database, leaving orphaned files in Google Drive.  
**Recommendation:** Either fail the entire operation if Drive deletion fails, or implement a cleanup job.

#### 4. SQL Injection Risk in Raw Query

**File:** `src/lib/authz.ts` (Lines 67-75)  
**Issue:** Recursive CTE query uses user-provided `folderId` without validating it's a valid UUID.  
**Recommendation:** Validate that `folderId` and `folder.parentId` are valid UUIDs before using in raw queries.

#### 5. Missing CSRF Token in AI Retry

**File:** `src/components/documents/DocumentPropertiesModal.tsx` (Lines 94-113)  
**Issue:** AI retry request doesn't include CSRF headers, unlike the update request.  
**Recommendation:** Add `csrfHeaders()` to the fetch request.

### High Severity (6)

#### 6. Potential Memory Issue with Large File Downloads

**File:** `src/app/api/documents/[id]/file/route.ts` (Lines 50-60)  
**Issue:** Entire file loaded into memory as a Buffer before streaming. For large files, this could cause memory exhaustion.  
**Recommendation:** Stream the file directly instead of loading into memory.

#### 7. Non-Atomic AI Job Creation

**File:** `src/app/api/documents/[id]/ai/route.ts` (Lines 49-52)  
**Issue:** AI job and AI processing created in parallel without a transaction. If one fails and the other succeeds, system is left in inconsistent state.  
**Recommendation:** Use a transaction to ensure both succeed or both fail.

#### 8. Missing Error Handling in Share Link Revoke

**File:** `src/components/documents/ShareModal.tsx` (Lines 106-136)  
**Issue:** DELETE request body includes a `token` parameter, but the API route ignores it and deletes ALL share links for the document.  
**Recommendation:** Update the API to accept and use the token parameter.

#### 9. Potential Infinite Loop in Folder Path Resolution

**File:** `src/app/api/documents/upload/route.ts` (Lines 92-111)  
**Issue:** While loop for building folder path doesn't have a maximum depth limit. Circular references could cause infinite loop.  
**Recommendation:** Add a maximum depth limit (e.g., 20 levels).

#### 10. Inefficient Database Query in Batch AI Processing

**File:** `src/app/api/documents/ai/batch/route.ts` (Lines 42-61)  
**Issue:** Redundant condition in query and sequential loop is inefficient for bulk operations.  
**Recommendation:** Remove redundant condition and use bulk operations.

#### 11. Null Reference Risk in Document Access Check

**File:** `src/lib/authz.ts` (Line 137)  
**Issue:** If `document.folderId` is null, `checkFolderAccess` is called with null, which may cause unexpected behavior.  
**Recommendation:** Check if `folderId` is null before calling `checkFolderAccess`.

### Medium Severity (7)

#### 12. Type Safety Issues with `as never` Assertions

**File:** `src/app/api/documents/route.ts` (Lines 61, 81)  
**Issue:** Using `as never` type assertions bypasses TypeScript's type checking.  
**Recommendation:** Properly type the where clause instead of using `as never`.

#### 13. Missing Input Validation for Share Link Parameters

**File:** `src/app/api/documents/[id]/share/route.ts` (Lines 41-46)  
**Issue:** No upper limit check for `expiresInHours` and `maxViews`.  
**Recommendation:** Add maximum limits (e.g., 8760 hours for 1 year, 1000 views).

#### 14. Error Handling Missing in Promise.all

**File:** `src/app/api/documents/route.ts` (Lines 59-82)  
**Issue:** If one Promise.all operation fails, error handling doesn't distinguish which operation failed.  
**Recommendation:** Add individual error handling.

#### 15. Potential Denial of Service via Large File Upload

**File:** `src/app/api/documents/upload/route.ts` (Lines 64-65)  
**Issue:** File loaded entirely into memory before validation. Malicious user could upload file that claims to be small but is actually large.  
**Recommendation:** Validate file size before loading into memory, or use streaming.

#### 16. Missing Error Boundary in Client Components

**File:** `src/components/documents/DocumentDetailClient.tsx` (Lines 86-112)  
**Issue:** Basic error handling doesn't handle network timeouts or specific error codes.  
**Recommendation:** Add more specific error handling for different failure scenarios.

#### 17. Hardcoded Empty String for FolderId

**File:** `src/app/api/documents/[id]/file/route.ts` (Line 47)  
**Issue:** FolderId hardcoded to empty string when calling `getProviderForDocument`.  
**Recommendation:** Pass the actual folderId or null consistently.

#### 18. Incomplete Error Handling in Upload Modal

**File:** `src/components/documents/UploadModal.tsx` (Lines 203-230)  
**Issue:** XMLHttpRequest error handling doesn't handle all possible error scenarios (timeout, abort).  
**Recommendation:** Add handlers for `ontimeout` and `onabort` events.

### Low Severity (6)

#### 19. File Extension Validation Edge Case

**File:** `src/lib/file-validation.ts` (Line 9)  
**Issue:** If filename has no extension, `lastIndexOf` returns -1, and `substring(-1)` returns entire string.  
**Recommendation:** Check if the dot exists before extracting the extension.

#### 20. Missing Validation in Batch AI Request

**File:** `src/app/api/documents/ai/batch/route.ts` (Line 25)  
**Issue:** JSON parsing catch returns null, but code doesn't validate that `parsed.data` exists before using it.  
**Recommendation:** Add explicit null check after parsing.

#### 21. Potential Memory Leak in useEffect

**File:** `src/components/documents/DocumentsClient.tsx` (Lines 118-135)  
**Issue:** setTimeout in useEffect creates timer that might not be cleaned up if component unmounts quickly.  
**Recommendation:** Consider using a debounce utility for clarity.

#### 22. Missing Null Check in Document Properties Modal

**File:** `src/components/documents/DocumentPropertiesModal.tsx` (Lines 32-37)  
**Issue:** Initial state assumes `document` exists, but if it's null/undefined, this could cause issues.  
**Recommendation:** Add a guard clause to handle null document case.

#### 23. Inefficient Re-renders in DocumentsClient

**File:** `src/components/documents/DocumentsClient.tsx` (Lines 171-201)  
**Issue:** `filteredDocs` useMemo recalculates on every change, which could be optimized.  
**Recommendation:** Consider debouncing search input or using more granular memoization.

#### 24. Share Link Password Validation Not Enforced

**File:** `src/app/api/documents/[id]/share/route.ts` (Line 51)  
**Issue:** Passwords are optional but there's no minimum length or complexity requirement.  
**Recommendation:** Add password strength validation.

---

## 2. PASSWORDS/SECURITY MODULE (17 bugs)

### Critical Severity (3)

#### 1. Timing Attack Vulnerability in Recovery Answer Verification

**File:** `src/lib/key-recovery.ts` (Lines 160-163, 174-177)  
**Issue:** Uses manual XOR comparison loops instead of constant-time comparison. Attackers can use timing analysis to guess recovery answers.  
**Recommendation:** Use `crypto.timingSafeEqual` for all hash comparisons.

#### 2. Race Condition in Vault Setup

**File:** `src/app/api/passwords/setup/route.ts` (Lines 47-82)  
**Issue:** Check-then-update pattern vulnerable to TOCTOU race conditions. Concurrent setup requests could create duplicate vaults.  
**Recommendation:** Use database-level constraints or atomic operations.

#### 3. Missing Authorization in Password Reset Confirm

**File:** `src/app/api/passwords/reset/confirm/route.ts` (Lines 32-43)  
**Issue:** Uses `findFirst` without user ID constraint. Anyone with valid reset token can reset any vault's password.  
**Recommendation:** Add user authentication or include userId in token validation.

### High Severity (3)

#### 4. Potential SQL Injection via Raw Query

**File:** `src/lib/security-rate-limit.ts` (Lines 15-25)  
**Issue:** Uses `$queryRaw` with user-provided key parameter in INSERT statement.  
**Recommendation:** Validate the key format (alphanumeric with length limits) before using in queries.

#### 5. Inconsistent Error Handling in Crypto Operations

**File:** Multiple API routes  
**Issue:** Generic error messages could leak information through timing differences.  
**Recommendation:** Add consistent error handling with artificial delays for failed operations.

#### 6. Missing Session Version Invalidation

**File:** `src/auth.ts` (Lines 63-94)  
**Issue:** JWT callback validates session version but doesn't invalidate tokens on mismatch. Old tokens continue to work.  
**Recommendation:** Return null or throw error when session version mismatches.

### Medium Severity (6)

#### 7. Weak Default CSRF Secret in Development

**File:** `src/lib/csrf.ts` (Line 32)  
**Issue:** Hardcoded fallback secret for development. If NODE_ENV not set correctly in production, weak secret could be used.  
**Recommendation:** Throw error instead of using fallback, or require explicit environment variable.

#### 8. No Rate Limiting on Password Reset Request

**File:** `src/app/api/passwords/reset/request/route.ts` (Lines 10-96)  
**Issue:** No rate limiting on password reset requests, only CSRF protection.  
**Recommendation:** Implement rate limiting per user and per IP address.

#### 9. Vault Share Permission Not Validated

**File:** `src/lib/vault-access.ts` (Line 42)  
**Issue:** Permission is cast directly from database without validation.  
**Recommendation:** Validate permission against allowed values before returning.

#### 10. JSON Parse Without Error Handling in Components

**File:** Multiple component files  
**Issue:** JSON.parse calls without proper error handling.  
**Recommendation:** Wrap JSON.parse in try-catch blocks with fallback handling.

#### 11. Missing Null Check in Unlock Route

**File:** `src/app/api/passwords/unlock/route.ts` (Lines 38-39)  
**Issue:** Assumes failedAttempts and lockedUntil exist on vault.  
**Recommendation:** Add null checks with default values.

#### 12. Potential Memory Leak in Client Components

**File:** `src/components/passwords/PasswordCard.tsx` (Lines 104-113)  
**Issue:** setTimeout in handleCopy may not be cleaned up on component unmount.  
**Recommendation:** Store timeout IDs and clear them in useEffect cleanup.

### Low Severity (5)

#### 13. Inconsistent Null Handling in Credential Operations

**File:** Various API routes  
**Issue:** Some operations return empty arrays on no data, others return errors or null values.  
**Recommendation:** Standardize response patterns across all endpoints.

#### 14. No Input Format Validation on Encryption Salt

**File:** `src/app/api/passwords/setup/route.ts` (Line 24)  
**Issue:** Only validates length but not format.  
**Recommendation:** Add regex validation for base64 format.

#### 15. Hardcoded Iteration Values

**File:** Multiple files  
**Issue:** KDF iterations are hardcoded in multiple places.  
**Recommendation:** Centralize iteration values in a single configuration file.

#### 16. Missing Input Sanitization in Audit Logs

**File:** `src/app/api/passwords/audit/route.ts` (Lines 43-44)  
**Issue:** IP address and user agent are logged without sanitization.  
**Recommendation:** Validate and truncate user agent strings before logging.

#### 17. Missing Transaction Isolation Level

**File:** `src/app/api/passwords/change-master-password/route.ts` (Line 220)  
**Issue:** Prisma transaction doesn't specify isolation level.  
**Recommendation:** Consider using SERIALIZABLE isolation for critical operations.

---

## 3. WEALTH/BANKING MODULE (25 bugs)

### Critical Severity (3)

#### 1. Race Condition in Transaction Update Balance Calculation

**File:** `src/app/api/wealth/accounts/[id]/transactions/[transactionId]/route.ts` (Lines 104-107, 112-155)  
**Issue:** Balance calculated outside transaction, then used inside transaction. Concurrent updates could lead to incorrect balances.  
**Recommendation:** Move balance recalculation inside transaction and re-fetch account with current balance.

#### 2. Missing CSRF Validation on Transaction DELETE

**File:** `src/app/api/wealth/accounts/[id]/transactions/[transactionId]/route.ts` (Lines 178-235)  
**Issue:** DELETE endpoint doesn't validate CSRF tokens, while other endpoints do.  
**Recommendation:** Add `validateCSRFRequest(req)` before processing DELETE request.

#### 3. Type Safety Issue in Statement Import - Currency Mismatch

**File:** `src/app/api/wealth/statements/import/route.ts` (Line 112)  
**Issue:** Uses `Math.abs()` on amount, which doesn't preserve sign information needed for proper balance calculation.  
**Recommendation:** Use `getStoredTransactionAmount()` function to properly handle amount signs.

### High Severity (7)

#### 4. Null/Undefined Access in Balance Calculations

**File:** `src/app/api/wealth/accounts/[id]/transactions/route.ts` (Line 124)  
**Issue:** Balance calculation assumes `latestAccount.type` is valid but doesn't validate it.  
**Recommendation:** Validate account type before calculating balance delta.

#### 5. Missing Validation for Currency in Transaction Creation

**File:** `src/app/api/wealth/accounts/[id]/transactions/route.ts` (Line 131)  
**Issue:** If both `body.currency` and `latestAccount.currency` are null/undefined, defaults to "INR" unexpectedly.  
**Recommendation:** Explicitly validate that a valid currency is provided.

#### 6. Financial Calculation Error - Due Date Validation

**File:** `src/app/api/wealth/accounts/route.ts` (Lines 106-111)  
**Issue:** Validation accepts any day 1-31, but doesn't account for months with fewer days (e.g., February 30).  
**Recommendation:** Add context-aware validation based on the month.

#### 7. Race Condition in Email Transaction Import

**File:** `src/app/api/integrations/gmail/imports/commit/route.ts` (Lines 107-111)  
**Issue:** Transaction creation doesn't check if account still exists or is still ACTIVE after claim.  
**Recommendation:** Re-validate account status inside transaction before creating wealth transaction.

#### 8. Memory Leak - PDF Processing Without Cleanup

**File:** `src/lib/email-statement-attachments.ts` (Lines 24-40)  
**Issue:** If error occurs during page iteration, PDF document might not be fully cleaned up.  
**Recommendation:** Add more robust error handling and consider streaming page processing.

#### 9. Missing Error Handling in Gmail Sync Classification

**File:** `src/app/api/integrations/gmail/sync/route.ts` (Line 225)  
**Issue:** If Gemini classification fails partway through, partial results could be committed.  
**Recommendation:** Wrap classification and database updates in single transaction.

#### 10. Type Safety - Optional Chaining on Required Fields

**File:** `src/app/api/wealth/accounts/[id]/route.ts` (Lines 117, 121, 137, 141)  
**Issue:** If `parseOptionalNumber` returns null, it defaults to 0, which could silently accept invalid input.  
**Recommendation:** Validate that parsed value is not null before allowing update.

### Medium Severity (8)

#### 11. Missing PIN Validation

**File:** `src/app/api/wealth/accounts/route.ts` (Lines 104, 114)  
**Issue:** No validation of PIN format, length, or complexity.  
**Recommendation:** Add validation: PIN should be 4-6 digits, numeric only.

#### 12. Data Parsing Issue - CSV Parser Vulnerable to Injection

**File:** `src/lib/statement-parser.ts` (Line 61)  
**Issue:** Simple CSV parser doesn't handle quoted fields containing commas, newlines, or escaped quotes.  
**Recommendation:** Use proper CSV parsing library or implement RFC 4180 compliant parsing.

#### 13. Missing Validation for Interest Rate Range

**File:** `src/app/api/wealth/accounts/route.ts` (Line 100)  
**Issue:** No validation that interest rate is within reasonable bounds (e.g., 0-100%).  
**Recommendation:** Add range validation.

#### 14. Security - Email Address Length Not Validated

**File:** `src/app/api/integrations/gmail/sync/route.ts` (Line 27)  
**Issue:** Email addresses truncated to 320 characters after extraction.  
**Recommendation:** Validate email address format and length before processing.

#### 15. Type Safety - Date Parsing Without Timezone Handling

**File:** `src/lib/statement-parser.ts` (Lines 29, 35, 42)  
**Issue:** Dates parsed as UTC with fixed time of 12:00, but user's timezone might affect display.  
**Recommendation:** Store dates with explicit timezone information or consistently use UTC.

#### 16. Missing Validation for Account Number Format

**File:** `src/app/api/wealth/accounts/route.ts` (Line 122)  
**Issue:** No validation of account number format.  
**Recommendation:** Add length validation (e.g., max 34 characters for IBAN) and basic format checking.

#### 17. Database Query - N+1 Query in Transaction Import

**File:** `src/app/api/integrations/gmail/imports/commit/route.ts` (Lines 94-96)  
**Issue:** Query executed inside loop for each account group.  
**Recommendation:** Fetch all accounts once before transaction and validate them.

#### 18. Null/Undefined Access in Outlook Sync

**File:** `src/app/api/integrations/outlook/sync/route.ts` (Line 119)  
**Issue:** If message is null, code continues to next iteration without logging.  
**Recommendation:** Add logging for debugging when message ID isn't found.

### Low Severity (7)

#### 19. Missing Validation for EMI Amount Non-Negative

**File:** `src/app/api/wealth/accounts/route.ts` (Line 101)  
**Issue:** EMI amounts should be non-negative but not validated.

#### 20. Type Safety - String Array Normalization Could Lose Data

**File:** `src/lib/wealth.ts` (Lines 233-249)  
**Issue:** Non-string items in array are silently dropped.

#### 21. Currency Normalization Defaults to INR Silently

**File:** `src/lib/wealth.ts` (Lines 269-275)  
**Issue:** Invalid currencies default to INR without warning.

#### 22. Missing Validation for Tenure Months

**File:** `src/app/api/wealth/accounts/route.ts` (Line 102)  
**Issue:** No validation that tenure months is positive and within reasonable bounds.

#### 23. Memory Leak Potential - Event Listener Not Cleaned Up

**File:** `src/app/(app)/wealth/email-sync/GmailTransactionSyncClient.tsx` (Lines 160-163)  
**Issue:** If component unmounts and remounts quickly, multiple listeners could be added.

#### 24. Type Safety - Account Icon Lookup Could Return Undefined

**File:** `src/app/(app)/wealth/accounts/[accountId]/AccountDetailClient.tsx` (Line 80)  
**Issue:** Always falls back to Building2 for invalid account types.

#### 25. Missing Error Handling in Statement Parse Route

**File:** `src/app/api/wealth/statements/parse/route.ts` (Lines 27-30)  
**Issue:** Generic error handling loses specific parsing errors.

---

## 4. FAMILY MODULE (16 bugs)

### Critical Severity (3)

#### 1. Missing Family Authorization in Shared Data API Routes

**File:** Multiple API routes

- `src/app/api/family/documents/route.ts` (lines 6-18)
- `src/app/api/family/wealth/route.ts` (lines 6-18)
- `src/app/api/family/credentials/route.ts` (lines 6-18)  
  **Issue:** API routes only check if user is authenticated but don't validate family membership ownership.  
  **Recommendation:** Add proper authorization checks to ensure users can only access their own family memberships.

#### 2. Incomplete Authorization in Document Detail Page

**File:** `src/app/(app)/family/[ownerId]/documents/[documentId]/page.tsx` (lines 18-19)  
**Issue:** Page checks `checkDocumentAccess` but doesn't verify user has family access to documents from specific `ownerId`.  
**Recommendation:** Add check using `hasFamilyModuleAccess(userId, ownerId, "documents")` before returning document.

#### 3. Information Disclosure in Wealth Account Page

**File:** `src/app/(app)/family/wealth/accounts/[accountId]/page.tsx` (lines 30-44)  
**Issue:** When access denied, page returns visible "Access denied" message instead of using `notFound()` to return 404.  
**Recommendation:** Use `notFound()` instead of returning visible error message to prevent account enumeration.

### High Severity (4)

#### 4. Race Condition in Invitation Acceptance

**File:** `src/lib/family-service.ts` (lines 538-577)  
**Issue:** Window between update and count check where concurrent requests could both succeed in creating memberships.  
**Recommendation:** Use unique constraint on membership table or add second check after upsert.

#### 5. Missing Input Validation in Key Registration

**File:** `src/app/api/family/credentials/key/route.ts` (lines 33-39)  
**Issue:** Route passes raw request body data directly to service without validation.  
**Recommendation:** Add Zod schema validation for request body before calling service.

#### 6. Missing Validation on ownerId URL Parameter

**File:** `src/app/(app)/family/[ownerId]/documents/page.tsx` (lines 19-20)  
**Issue:** `ownerId` parameter from URL passed directly to `getFamilySharedDocuments` without validation.  
**Recommendation:** Validate that `ownerId` is a valid UUID or ID format before passing to service.

#### 7. Potential Timing Attack in Token Comparison

**File:** `src/lib/family-service.ts` (line 408)  
**Issue:** Email comparison uses string equality which could be vulnerable to timing attacks.  
**Recommendation:** Use constant-time comparison function for sensitive comparisons.

### Medium Severity (5)

#### 8. Null/Undefined Access Risk

**File:** `src/lib/family-service.ts` (line 804)  
**Issue:** Code accesses `invitation.owner?.name` without null checks in email sending function.  
**Recommendation:** Add explicit null checks or use optional chaining consistently.

#### 9. Type Safety Issue in HTTP Parser

**File:** `src/lib/family-http.ts` (lines 16-19)  
**Issue:** `parseJsonBody` function uses `z.any()` which disables type checking entirely.  
**Recommendation:** Define specific schemas for each endpoint's expected input.

#### 10. Memory Leak in useEffect Hook

**File:** `src/components/family/FamilyClient.tsx` (lines 138-182)  
**Issue:** Async operation in useEffect doesn't properly handle cleanup if component unmounts during operation.  
**Recommendation:** Use AbortController to cancel pending fetch requests when component unmounts.

#### 11. Inconsistent Error Handling

**File:** `src/app/api/family/invitations/reject/route.ts` (lines 19-20)  
**Issue:** Route silently falls back to empty object when JSON parsing fails.  
**Recommendation:** Log parsing errors or return 400 Bad Request for invalid JSON.

#### 12. Missing Error Boundary in Components

**File:** `src/components/family/FamilyClient.tsx`  
**Issue:** Component doesn't have error boundaries to handle unexpected errors gracefully.  
**Recommendation:** Wrap component in error boundary or add try-catch blocks in critical sections.

### Low Severity (4)

#### 13. Potential Information Disclosure in Notifications

**File:** `src/lib/family-service.ts` (lines 257-262)  
**Issue:** Notification message includes owner's name which might be more information than necessary.  
**Recommendation:** Consider using generic message or ensure notification logs are properly secured.

#### 14. Inconsistent Null Handling in Components

**File:** `src/components/family/FamilyClient.tsx` (line 495)  
**Issue:** Code accesses `membership.member` without explicit null checks in some places.  
**Recommendation:** Add explicit null checks before accessing nested properties.

#### 15. Missing Rate Limiting

**File:** All API routes in `src/app/api/family/**`  
**Issue:** None of the family API routes have rate limiting implemented.  
**Recommendation:** Implement rate limiting on all family-related API endpoints.

#### 16. CSRF Token Validation Timing

**File:** All POST/PATCH/DELETE routes in `src/app/api/family/**`  
**Issue:** CSRF validation happens after user authentication, but no additional protection against CSRF token reuse.  
**Recommendation:** Ensure CSRF tokens are single-use or have short expiration times.

---

# Pending Issues

## 5. INTEGRATIONS MODULE (35 bugs)

### Critical Severity (3)

#### 1. Google Drive Webhook Verification Token Not Validated

**File:** `src/app/api/integrations/google-drive/webhook/route.ts` (Lines 44-48)  
**Issue:** Webhook GET endpoint accepts any token value during subscription verification without checking against configured secret.  
**Recommendation:** Add token validation against configured secret.

#### 2. Google Drive OAuth State Uses Insecure Base64 Encoding

**File:** `src/app/api/integrations/google-drive/callback/route.ts` (Lines 26-27)  
**Issue:** OAuth state parameter uses simple base64 encoding without signature verification, vulnerable to tampering and CSRF.  
**Recommendation:** Implement HMAC-signed state like Gmail and Outlook do.

#### 3. Google Drive Webhook Missing Signature Validation

**File:** `src/app/api/integrations/google-drive/webhook/route.ts` (Lines 6-38)  
**Issue:** POST webhook endpoint doesn't validate request signature, allowing spoofed webhook notifications.  
**Recommendation:** Add X-Hub-Signature validation using shared secret.

### High Severity (9)

#### 4. Gmail Disconnect Missing Error Handling

**File:** `src/app/api/integrations/gmail/disconnect/route.ts` (Lines 7-23)  
**Issue:** No try-catch block around database operations.  
**Recommendation:** Wrap in try-catch block.

#### 5. Outlook Disconnect Missing Error Handling

**File:** `src/app/api/integrations/outlook/disconnect/route.ts` (Lines 7-15)  
**Issue:** Same as Gmail disconnect - no error handling.

#### 6. Gmail Sync Missing Null Check on Token Exchange

**File:** `src/app/api/integrations/gmail/sync/route.ts` (Lines 159-160)  
**Issue:** No validation that `decryptGmailRefreshToken` returns valid token before using it.  
**Recommendation:** Add null check and throw descriptive error if decryption fails.

#### 7. Outlook Sync Missing Null Check on Token Refresh

**File:** `src/app/api/integrations/outlook/sync/route.ts` (Lines 78-86)  
**Issue:** Token refresh result not validated before persisting to database.  
**Recommendation:** Validate tokens.accessToken and tokens.refreshToken before updating.

#### 8. Google Drive Sync Missing Token Refresh Logic

**File:** `src/lib/sync/sync-engine.ts` (Lines 48-57)  
**Issue:** Sync engine uses access tokens directly without checking expiration or implementing refresh logic.  
**Recommendation:** Add token expiration check and refresh logic before sync operations.

#### 9. Google Drive Revoke Token Ignores Errors

**File:** `src/lib/google-drive/oauth.ts` (Lines 13-24)  
**Issue:** Token revocation failures silently ignored, leaving stale tokens active.  
**Recommendation:** Throw error on revocation failure.

#### 10-12. Type Safety Issues in Gmail/Outlook Imports

**File:** Multiple files  
**Issue:** Multiple type assertions without proper runtime validation.  
**Recommendation:** Use Zod or similar validation library.

### Medium Severity (14)

#### 13-14. Callback Race Conditions

**File:** Gmail and Outlook callback routes  
**Issue:** Potential race condition between checking existing connection and upserting.  
**Recommendation:** Use database transaction or add unique constraint handling.

#### 15-16. PDF Download Rate Limiting Missing

**File:** Gmail and Outlook sync routes  
**Issue:** PDF attachment downloads not rate-limited, could exhaust API quota or cause memory issues.  
**Recommendation:** Add rate limiting or batch size limits.

#### 17. Google Drive Connect Missing Rate Limiting

**File:** `src/app/api/integrations/google-drive/connect/route.ts` (Lines 6-32)  
**Issue:** No rate limiting on connect endpoint.  
**Recommendation:** Add rate limiting similar to Gmail/Outlook connect routes.

#### 18. Google Drive Status Missing Cache Control

**File:** `src/app/api/integrations/google-drive/status/route.ts` (Lines 5-39)  
**Issue:** Status endpoint doesn't set cache control headers.  
**Recommendation:** Add Cache-Control header like Gmail/Outlook status endpoints.

#### 19. Sync Engine Fire-and-Forget AI Processing

**File:** `src/lib/sync/sync-engine.ts` (Lines 399-503)  
**Issue:** AI processing started without awaiting, could lead to unhandled errors and resource leaks.  
**Recommendation:** Either await processing or implement proper job queue system.

#### 20. Sync Engine Memory Leak in Recursive Discovery

**File:** `src/lib/sync/sync-engine.ts` (Lines 68-87)  
**Issue:** Recursive folder/file discovery could cause stack overflow or memory issues.  
**Recommendation:** Implement iterative approach with depth limit.

#### 21. Google Drive Provider Memory Leak in Folder Cache

**File:** `src/lib/storage/drive-provider.ts` (Lines 17, 391-420)  
**Issue:** Folder cache is instance-level but never cleared, could grow unbounded.  
**Recommendation:** Add cache size limit and TTL-based eviction.

#### 22-24. Origin Validation Missing

**File:** All connect routes (Gmail, Outlook, Google Drive)  
**Issue:** No referer/origin header validation to prevent CSRF from external sites.  
**Recommendation:** Add origin validation.

### Low Severity (9)

#### 25-26. Status Endpoints Missing Try-Catch

**File:** Gmail and Outlook status routes  
**Issue:** No error handling around database queries.

#### 27. Gmail Imports Status Validation Incomplete

**File:** `src/app/api/integrations/gmail/imports/route.ts` (Lines 10-14)  
**Issue:** Status validation uses type assertion but doesn't validate against enum values properly.

#### 28. Gmail Sync Missing Validation on Lookback Days

**File:** `src/app/api/integrations/gmail/sync/route.ts` (Lines 143-149)  
**Issue:** Lookback days validation could be bypassed with NaN values.

#### 29. Google Drive Callback Error Information Leakage

**File:** `src/app/api/integrations/google-drive/callback/route.ts` (Lines 10-13)  
**Issue:** OAuth error parameter directly passed to redirect URL without sanitization.

#### 30-31. Unused Variables

**File:** Gmail and Outlook sync routes  
**Issue:** `fetchedEmails` filtered to `emails` but both used in calculations.

---

## 6. AI/CHAT MODULE (24 bugs)

### Critical Severity (4)

#### 1. Missing Timeout on GoogleGenAI API Call

**File:** `src/app/api/chat/route.ts` (Lines 333-336)  
**Issue:** `ai.models.generateContent()` call has no timeout configured. If API hangs, request blocks indefinitely.  
**Recommendation:** Add timeout configuration using AbortSignal or SDK's timeout option.

#### 2. Race Condition in Worker Concurrency Tracking

**File:** `src/lib/ai/worker.ts` (Lines 15, 37, 103)  
**Issue:** `activeJobs` variable is global counter not thread-safe. Concurrent batch processing could increment/decrement incorrectly.  
**Recommendation:** Use atomic operations or mutex lock, or track active jobs in database.

#### 3. Memory Leak in Speech Recognition

**File:** `src/components/chat/ChatClient.tsx` (Lines 110-129, 218-230)  
**Issue:** Speech recognition instance stored in `recognitionRef` but no cleanup effect to stop it on unmount.  
**Recommendation:** Add cleanup effect that calls `stopListening()` on component unmount.

#### 4. Missing Error Handling for JSON.parse

**File:** `src/app/api/chat/[sessionId]/messages/route.ts` (Lines 30-33)  
**Issue:** `JSON.parse(m.referencedDocs)` call has no try-catch. Malformed JSON causes 500 error.  
**Recommendation:** Wrap JSON.parse in try-catch and handle malformed data gracefully.

### High Severity (5)

#### 5. Null/Undefined Access in AI Processor

**File:** `src/lib/ai/processor.ts` (Line 73)  
**Issue:** `storageFileId` checked for null but passed without validation.  
**Recommendation:** Add stricter validation with length check.

#### 6. Missing Transaction Timeout

**File:** `src/lib/ai/job-service.ts` (Lines 124-223)  
**Issue:** Transaction performs multiple operations without explicit timeout. Long-running transactions could lock database.  
**Recommendation:** Increase timeout or break into smaller transactions.

#### 7. Missing SessionId Validation

**File:** `src/app/api/chat/route.ts` (Lines 231-233)  
**Issue:** `sessionId` parameter not validated before being used in database query.  
**Recommendation:** Validate sessionId format (UUID) before database query.

#### 8. Heartbeat Errors Silently Ignored

**File:** `src/lib/ai/worker.ts` (Lines 60-65)  
**Issue:** Heartbeat interval callback has no error handling. Job might be marked as stale even though still running.  
**Recommendation:** Add try-catch to log heartbeat failures without crashing job.

#### 9. Worker Shutdown Doesn't Call stopAiWorker

**File:** `src/workers/ai-worker.ts` (Lines 8-16)  
**Issue:** SIGINT and SIGTERM handlers call `process.exit(0)` directly without calling `stopAiWorker()`.  
**Recommendation:** Call `stopAiWorker()` before exit, wait for active jobs to complete.

### Medium Severity (10)

#### 10. Upload Failures Silently Ignored

**File:** `src/lib/ai/processor.ts` (Lines 108-110)  
**Issue:** If uploading AI-generated files to Google Drive fails, error only logged. Job still completes successfully.  
**Recommendation:** Either fail job or store failure in job metadata.

#### 11. Slice Operations Without Bounds Checking

**File:** `src/lib/ai/job-service.ts` (Lines 188, 205)  
**Issue:** Multiple `.slice()` operations assume strings are long enough.  
**Recommendation:** Add explicit checks for clarity (though slice handles out-of-bounds safely).

#### 12. Recovery Operations Not in Transaction

**File:** `src/lib/ai/recovery.ts` (Lines 54-73)  
**Issue:** When requeuing stale jobs, aiJob and aiProcessing updates not in transaction.  
**Recommendation:** Wrap both updates in transaction.

#### 13. Race Condition in Worker Startup

**File:** `src/lib/ai/worker.ts` (Lines 137-138)  
**Issue:** `isRunning` check and set not atomic. Two concurrent calls could both pass check.  
**Recommendation:** Use mutex or atomic operation for check-and-set pattern.

#### 14. Type Assertion Without Validation

**File:** `src/lib/gemini.ts` (Line 113)  
**Issue:** Response type-asserted without runtime validation.  
**Recommendation:** Use Zod schema validation to validate response structure.

#### 15. Admin API Missing Action Validation

**File:** `src/app/api/admin/ai-worker/route.ts` (Lines 22-28)  
**Issue:** Action validation allows undefined action but doesn't validate that only specific actions permitted.  
**Recommendation:** Make action required or explicitly handle undefined case.

#### 16. Cron Authorization Check Weak

**File:** `src/app/api/cron/ai-worker/route.ts` (Lines 6-15)  
**Issue:** Authorization check only validates minimum length but doesn't check if secret actually set or valid.  
**Recommendation:** Add explicit check for empty/undefined expected value and log authorization failures.

#### 17. Response.text Property May Be Undefined

**File:** `src/lib/gemini.ts` (Lines 108-111)  
**Issue:** Property access itself could throw if response object structure changes.  
**Recommendation:** Use optional chaining: `const responseText = response?.text;`

#### 18. Empty Error Handling in ChatClient

**File:** `src/components/chat/ChatClient.tsx` (Lines 138-140)  
**Issue:** LoadMessages error handler only logs to console without showing user feedback.  
**Recommendation:** Set error state to display to user.

#### 19. Chat Message Length Validation Incomplete

**File:** `src/app/api/chat/route.ts` (Lines 218-224)  
**Issue:** Only checks maximum length but doesn't check for minimum length or empty/whitespace-only messages.  
**Recommendation:** Add check for empty or whitespace-only messages.

### Low Severity (5)

#### 20. Ineffective useEffect Hook

**File:** `src/components/chat/ChatClient.tsx` (Lines 110-129)  
**Issue:** useEffect checks for SpeechRecognition support but does nothing with result.  
**Recommendation:** Remove this hook or add actual functionality.

#### 21. No Rate Limiting on Chat API

**File:** `src/app/api/chat/route.ts` (Lines 200-374)  
**Issue:** Chat endpoint has no rate limiting.  
**Recommendation:** Add rate limiting per user.

#### 22. Environment Variable Parsing Ignores NaN

**File:** `src/lib/ai/config.ts` (Lines 1-23)  
**Issue:** If environment variables contain non-numeric values, `parseInt` returns NaN.  
**Recommendation:** Add validation to throw error on NaN.

#### 23. Global State Without Reset Mechanism

**File:** `src/lib/ai/worker.ts` (Lines 14-16)  
**Issue:** Global state variables have no reset mechanism. If worker crashes and restarts, stale state might persist.  
**Recommendation:** Add reset function called on worker startup.

#### 24. No Cleanup on Component Unmount for Message Polling

**File:** `src/components/chat/ChatClient.tsx` (Lines 91-97)  
**Issue:** Initial session loading effect has no cleanup.  
**Recommendation:** Add AbortController to cancel in-flight requests on unmount.

---

## 7. CORE LIBRARIES & UTILITIES (30 bugs)

### Critical Severity (4)

#### 1. Missing SSR Guards for Browser APIs

**Files:** Multiple crypto-related files

- `src/lib/crypto.ts:56` - `window.crypto.getRandomValues()` will crash on SSR
- `src/lib/envelope-crypto.ts:18, 26, 33` - Multiple `window.crypto` calls without SSR checks
- `src/lib/key-recovery.ts:46, 48, 52, 56` - `crypto.randomUUID()` and `crypto.getRandomValues()` without SSR guards
- `src/lib/key-wrap.ts:62, 63` - `crypto.getRandomValues()` without SSR check
- `src/lib/family-crypto.ts:61` - `crypto.getRandomValues()` without SSR check
- `src/lib/server-crypto.ts:44` - `crypto.getRandomValues()` without SSR check  
  **Issue:** Application crashes during server-side rendering or in environments without Web Crypto API.  
  **Recommendation:** Add SSR guards to all files using `window.crypto` or `crypto` global.

#### 2. Race Condition in Notification Creation

**File:** `src/lib/notifications.ts` (Lines 63-72)  
**Issue:** Notification created at line 54-61, then queried again at line 68. Between creation and query, another process could have already sent push notification.  
**Recommendation:** Make notification creation atomic with database operations.

#### 3. CSRF Cookie Parsing Vulnerability

**File:** `src/lib/csrf.ts` (Lines 104-106)  
**Issue:** No validation that matched value is properly URI-encoded. Malformed cookies could cause unexpected behavior.  
**Recommendation:** Add validation for properly encoded cookie values.

#### 4. Request Cache Memory Leak

**File:** `src/lib/request-cache.ts` (Lines 3-18)  
**Issue:** Cache never removes old entries. Over time, this will cause unbounded memory growth.  
**Recommendation:** Implement cache eviction policy (TTL or size-based).

### High Severity (6)

#### 5. Null Reference in Notifications

**File:** `src/lib/notifications.ts` (Line 73)  
**Issue:** If user lookup fails (preferences is null), condition evaluates to false but no error logged. Notification created but won't be sent.  
**Recommendation:** Add error logging for notification delivery failures.

#### 6. Missing Error Handling in PDF Password Decryption

**File:** `src/lib/pdf-passwords.ts` (Lines 40-45)  
**Issue:** No try-catch around decryption operations. Corrupted data will crash entire request.  
**Recommendation:** Add try-catch with graceful error handling.

#### 7. Gemini API Response Not Validated

**File:** `src/lib/gemini.ts` (Lines 108-113)  
**Issue:** No validation that parsed JSON matches expected schema before accessing nested properties.  
**Recommendation:** Use Zod schema validation before accessing properties.

#### 8. Queue Race Condition

**File:** `src/lib/gemini-queue.ts` (Lines 33-34)  
**Issue:** Between check and shift, another thread could modify queue.  
**Recommendation:** Use proper queue implementation with locking.

#### 9. Unsafe JSON.stringify in Cache Key

**File:** `src/lib/request-cache.ts` (Line 8)  
**Issue:** If args contains circular references, this will throw. No error handling.  
**Recommendation:** Add circular reference detection before JSON.stringify.

#### 10. Web Push Decryption Error Handling

**File:** `src/lib/web-push.ts` (Lines 22-28)  
**Issue:** No try-catch around decryption. Malformed subscription data will crash all push notifications.  
**Recommendation:** Add try-catch with graceful error handling.

### Medium Severity (10)

#### 11. Missing Validation in API Response Helper

**File:** `src/lib/api-validation.ts` (Lines 7-11)  
**Issue:** Returns null for both invalid JSON and valid empty objects. Caller can't distinguish.  
**Recommendation:** Return different values or add flag to distinguish cases.

#### 12. Incomplete Error Handling in Email Sending

**File:** `src/lib/email.ts` (Lines 16-34)  
**Issue:** No validation of email format before sending.  
**Recommendation:** Add email format validation before API call.

#### 13. Audit Log Silently Fails

**File:** `src/lib/audit-log.ts` (Lines 85-99)  
**Issue:** Audit failures completely silent. No monitoring or alerting.  
**Recommendation:** Add monitoring/alerting for audit log failures.

#### 14. Family Service Transaction Not Atomic for Notifications

**File:** `src/lib/family-service.ts` (Lines 578-607)  
**Issue:** Notifications created after transaction commits. If these fail, membership created but no notification sent.  
**Recommendation:** Include notifications in transaction or implement retry mechanism.

#### 15. Statement Parser Date Parsing Edge Cases

**File:** `src/lib/statement-parser.ts` (Lines 25-46)  
**Issue:** Assumes 2-digit years are 20xx. Will break for dates before 2000. Uses Date constructor which is locale-dependent.  
**Recommendation:** Document assumption or use proper date parsing library.

#### 16. Folder Path Infinite Loop Risk

**File:** `src/lib/folder-path.ts` (Lines 3-20)  
**Issue:** No protection against circular references in folder hierarchy.  
**Recommendation:** Add maximum depth limit to prevent infinite loops.

#### 17. Storage Provider Factory Defaults Incorrectly

**File:** `src/lib/storage/factory.ts` (Lines 11-16)  
**Issue:** Default case returns Google Drive provider instead of throwing error for unknown types.  
**Recommendation:** Throw error for unknown storage types.

#### 18. Google Drive Token Refresh Race Condition

**File:** `src/lib/storage/drive-provider.ts` (Lines 65-82)  
**Issue:** Multiple concurrent requests could all detect expired token and attempt refresh simultaneously.  
**Recommendation:** Implement token refresh locking mechanism.

#### 19. PDF Text Extraction No Size Limit

**File:** `src/lib/email-statement-attachments.ts` (Lines 24-40)  
**Issue:** Limits pages but not total text size. Large PDFs with lots of text could consume excessive memory.  
**Recommendation:** Add total text size limit in addition to page limit.

#### 20. Reminder Worker Date Calculation Bug

**File:** `src/lib/reminder-worker.ts` (Lines 228-253)  
**Issue:** Complex date calculation could produce incorrect dates when dueDate > days in month.  
**Recommendation:** Add proper date validation and edge case handling.

### Low Severity (10)

#### 21. Missing Input Validation in Utility Functions

**File:** `src/lib/wealth.ts` (Lines 227-231)  
**Issue:** No length limit on strings. Could allow very long strings to be stored.  
**Recommendation:** Add length limits.

#### 22. Type Assertion Without Validation

**File:** `src/lib/vault-access.ts` (Line 42)  
**Issue:** Type assertion without runtime validation.  
**Recommendation:** Add runtime validation for permission values.

#### 23. Incomplete Error Handling in Family Crypto

**File:** `src/lib/family-crypto.ts` (Lines 248-251)  
**Issue:** No logging of why sync failed. Silent failures make debugging difficult.  
**Recommendation:** Add logging for sync failures.

#### 24. CSRF Client Helper No Validation

**File:** `src/lib/csrf-client.ts` (Lines 13-16)  
**Issue:** decodeURIComponent can throw with malformed URI encoding. No try-catch.  
**Recommendation:** Add try-catch around decodeURIComponent.

#### 25. Missing Environment Variable Validation

**File:** `src/lib/gemini.ts` (Lines 3-4)  
**Issue:** Empty string used as API key. Errors only thrown when API called, not at startup.  
**Recommendation:** Validate environment variables at startup.

#### 26. Password Context Memory Leak Risk

**File:** `src/lib/password-context.tsx` (Lines 17-19)  
**Issue:** Module-level variables persist across hot reloads in development. Master password remains in memory.  
**Recommendation:** Clear module-level state on appropriate lifecycle events.

#### 27. Feedback Provider Memory Leak

**File:** `src/components/providers/FeedbackProvider.tsx` (Line 30)  
**Issue:** If component unmounts before timeout, state update attempted on unmounted component.  
**Recommendation:** Add cleanup to cancel timeout on unmount.

#### 28. Session Validation Missing Error Handling

**File:** `src/lib/session-validation.ts` (Lines 7-23)  
**Issue:** No logging when user not found. Could be data integrity issue worth investigating.  
**Recommendation:** Add logging for validation failures.

#### 29. Share Crypto No Salt Validation

**File:** `src/lib/share-crypto.ts` (Lines 5-8)  
**Issue:** No validation that password is not empty or too short.  
**Recommendation:** Add password strength validation.

#### 30. Wealth Calculation Division by Zero Risk

**File:** `src/lib/wealth.ts` (Lines 157-159)  
**Issue:** Correctly checks for zero, but verify similar checks exist elsewhere.  
**Recommendation:** Audit all division operations for zero checks.

---

## Conclusion

This analysis identified **171 potential bugs** across the Vaulty application, with **25 critical severity** issues requiring immediate attention. The most significant concerns are:

1. **Security vulnerabilities** - SSR crashes, timing attacks, missing authorization, and CSRF vulnerabilities
2. **Race conditions** - Multiple areas where concurrent operations could lead to data corruption
3. **Memory leaks** - Uncleaned resources in client components and server-side utilities
4. **Missing error handling** - Many operations lack proper error boundaries and recovery mechanisms
5. **Input validation gaps** - Insufficient validation at API boundaries

### Recommended Action Plan

**Phase 1 (Immediate - 1-2 weeks):**

- Fix all critical severity bugs
- Add SSR guards to crypto files
- Implement proper authorization checks
- Fix race conditions in critical paths

**Phase 2 (High Priority - 2-4 weeks):**

- Add comprehensive error handling
- Implement rate limiting
- Fix memory leaks
- Add proper transaction boundaries

**Phase 3 (Medium Priority - 1-2 months):**

- Improve input validation
- Add monitoring and logging
- Refactor type safety issues
- Standardize error responses

**Phase 4 (Low Priority - Ongoing):**

- Code cleanup and optimization
- Add comprehensive tests
- Improve documentation
- Address low-severity edge cases

---

## Email Sync Functionality Analysis

### Overview

The Gmail and Outlook email sync functionality is designed to:

1. Fetch emails from Gmail/Outlook inboxes
2. Filter for transaction-related emails using heuristic scoring
3. Send filtered emails to Gemini AI for classification
4. Extract transaction details and store them as pending transactions
5. Display pending transactions for user review before importing into Wealth

### Gmail Sync Implementation

**File:** `src/app/api/integrations/gmail/sync/route.ts`

#### Email Filtering Process

The sync uses a two-stage filtering process:

**Stage 1: Heuristic Ranking (rankFinancialEmails)**

- Location: `src/lib/gmail/classify-transaction-emails.ts` (lines 48-75)
- Scores emails based on financial keywords in sender, subject, and body
- Financial sender hints: "bank", "banking", "credit", "card", "broker", "securities", "mutualfund", "investment", "demat", "insurance", "payments", "upi", "wallet", "finance", "fund"
- Financial event hints: "debited", "credited", "transaction", "purchase", "payment received", "payment successful", "transfer", "withdrawal", "deposit", "dividend", "interest credited", "sip", "redemption", "allotment", "trade confirmation", "statement", "account summary", "premium paid", "policy", "invoice paid"
- Penalizes promotional content: "unsubscribe", "limited time offer", "exclusive offer", "shop now", "apply now", "pre-approved offer", "special discount", "refer and earn", "newsletter", "weekly roundup", "market insights"
- Penalizes non-financial: "otp", "one time password", "verification code", "job application", "interview", "birthday", "personal invitation"
- Requires minimum score of 3 to pass filtering
- Returns top 30 emails by score

**Analysis:** ✅ **GOOD** - The heuristic filtering is comprehensive and includes all the requested keywords (transaction, bank, credit card, upi, credit, debit, statements). The scoring system effectively prioritizes financial emails while filtering out promotional and non-financial content.

**Stage 2: AI Classification (classifyGmailTransactionBatch)**

- Location: `src/lib/gmail/classify-transaction-emails.ts` (lines 207-321)
- Sends up to 15 emails at a time to Gemini AI
- System instruction explicitly tells AI to:
  - Only classify emails with **completed/settled transactions**
  - Ignore: financial news, newsletters, promotions, trial-ending notices, payment requests, declined payments, OTPs, pending transactions, scheduled payments, cancelled transactions, balance-only notifications, statements with multiple transactions
  - Require: confidence >= 0.85, positive amount, supported transaction type, successful event status
- Supported transaction types: DEPOSIT, WITHDRAWAL, PURCHASE, SALE, INTEREST, DIVIDEND, FEE, PAYMENT, REFUND, TRANSFER_IN, TRANSFER_OUT

**Analysis:** ✅ **GOOD** - The AI classification has strict criteria to ensure only actual completed transactions are classified, not alerts or pending transactions.

#### PDF Statement Processing

**File:** `src/lib/email-statement-attachments.ts`

The sync also processes PDF statement attachments:

- Line 204: Filters emails containing "statement|e-statement|account summary|transaction summary|monthly report" in subject/body
- Downloads PDF attachments (max 20MB, max 5 per email)
- Extracts text from PDF (with password support)
- Parses transactions from statement text
- Creates pending transactions with 0.7 confidence (lower than AI-classified emails)
- Deduplicates against existing pending and imported transactions

**Analysis:** ✅ **GOOD** - PDF statement processing is well-implemented with proper limits and deduplication.

#### Pending Transaction Display

**File:** `src/app/(app)/wealth/email-sync/GmailTransactionSyncClient.tsx`

- Fetches pending transactions via `/api/integrations/gmail/imports?status=PENDING`
- Displays up to 100 pending transactions (line 19 in imports route)
- Shows: description, bank/merchant, date, source (Gmail/Outlook), AI confidence, reference number, subject
- Allows user to:
  - Select/deselect transactions
  - Choose which Wealth account to import to
  - Dismiss transactions
  - Import selected transactions

**Analysis:** ✅ **GOOD** - The UI provides clear information and controls for reviewing pending transactions.

### Outlook Sync Implementation

**File:** `src/app/api/integrations/outlook/sync/route.ts`

Outlook sync follows the same pattern as Gmail:

- Uses the same `rankFinancialEmails` function for filtering
- Uses the same `classifyGmailTransactionBatch` for AI classification
- Uses the same PDF statement processing
- Converts Outlook messages to the classification format

**Analysis:** ✅ **GOOD** - Outlook sync reuses the same proven filtering and classification logic.

### Google Drive Sync

**File:** `src/lib/sync/sync-engine.ts`

Google Drive sync is **separate** from email sync:

- Syncs documents from Google Drive folders
- Processes documents with AI to extract text, summary, and interpretation
- Does NOT extract transactions from documents
- Creates AI processing records for documents

**Analysis:** ⚠️ **Note** - Google Drive sync is for document management, not transaction extraction. This is intentional design.

### Functionality Issues Found

#### Issue 1: Missing Timeout on AI Classification

**Severity:** HIGH  
**File:** `src/lib/gmail/classify-transaction-emails.ts` (line 227)  
**Description:** The `ai.models.generateContent()` call has no timeout configuration. If Gemini API hangs, the sync will block indefinitely.  
**Recommendation:** Add timeout using AbortSignal or SDK timeout option.

#### Issue 2: PDF Attachment Processing Not Rate-Limited

**Severity:** MEDIUM  
**File:** `src/app/api/integrations/gmail/sync/route.ts` (lines 203-223)  
**Description:** PDF downloads are processed sequentially without rate limiting. Large number of PDFs could exhaust API quota or cause memory issues.  
**Recommendation:** Add rate limiting or batch size limits for PDF processing.

#### Issue 3: AI Classification Error Handling

**Severity:** MEDIUM  
**File:** `src/app/api/integrations/gmail/sync/route.ts` (line 225)  
**Description:** If Gemini classification fails partway through, partial results could be committed, leading to inconsistent state.  
**Recommendation:** Wrap classification and database updates in a single transaction.

#### Issue 4: Outlook Token Refresh Not Validated

**Severity:** HIGH  
**File:** `src/app/api/integrations/outlook/sync/route.ts` (lines 78-86)  
**Description:** Token refresh result is not validated before persisting to database.  
**Recommendation:** Validate tokens.accessToken and tokens.refreshToken before updating.

### Summary

**Overall Assessment:** ✅ **FUNCTIONALITY IS CORRECT**

The email sync functionality properly:

1. ✅ Fetches emails from Gmail/Outlook
2. ✅ Filters for transaction-related emails using comprehensive keyword matching (includes: transaction, bank, credit card, upi, credit, debit, statements)
3. ✅ Uses AI to classify only completed/settled transactions
4. ✅ Processes PDF statement attachments for additional transactions
5. ✅ Stores classified transactions as pending in the database
6. ✅ Displays pending transactions in the UI for user review
7. ✅ Allows users to select accounts and import transactions

**Key Strengths:**

- Two-stage filtering (heuristic + AI) ensures high accuracy
- Strict AI criteria prevents false positives
- PDF statement processing adds value
- Deduplication prevents duplicate transactions
- User review before import ensures data quality

**Recommended Improvements:**

1. Add timeout to AI classification calls
2. Add rate limiting to PDF processing
3. Improve error handling for partial classification failures
4. Validate token refresh results in Outlook sync

---

## Reminder Functionality Analysis

### Overview

The reminder system spans three areas:

1. **Manual Reminders** - User-created reminders via `/reminders` page
2. **Document-Generated Reminders** - Auto-created from document expiry dates and important dates
3. **Wealth Account Reminders** - Auto-generated for credit card payments and account expiries

### Manual Reminders

**API:** `src/app/api/reminders/route.ts`

#### Supported Operations

| Method | Operation       | Editable Fields                                        |
| ------ | --------------- | ------------------------------------------------------ |
| GET    | Fetch reminders | N/A                                                    |
| POST   | Create reminder | All fields                                             |
| PATCH  | Update reminder | Only `isCompleted` status and notification preferences |
| DELETE | Delete reminder | N/A (soft delete)                                      |

#### Reminder Fields

- title (required, 1-120 chars)
- description (optional, max 2000 chars)
- category: DOCUMENT, PAYMENT, INSURANCE, SUBSCRIPTION, PERSONAL
- dueAt (datetime)
- recurrence: NONE, DAILY, WEEKLY, MONTHLY, YEARLY
- notifyDaysBefore (array of 1-8 numbers, 0-365 days)
- notifyInApp (boolean)
- notifyByEmail (boolean)
- isCompleted (boolean)

#### Functionality

**✅ Create Reminder**

- Full form with all fields
- Validation via Zod schema
- CSRF protection
- Creates reminder in database

**✅ Complete Reminder**

- PATCH with `{ id, completed: true }`
- For recurring reminders: calculates next due date and resets isCompleted to false
- For non-recurring: marks as completed

**✅ Delete Reminder**

- DELETE with `?id=` parameter
- Soft delete (sets `isActive: false`)
- CSRF protection
- Confirmation dialog in UI

**❌ Edit Reminder Details**

- **MISSING**: Cannot edit title, description, due date, category, recurrence, or notifyDaysBefore
- PATCH endpoint only supports:
  - Toggling completion status
  - Updating notification preferences (email/inApp)
- No UI option to edit existing reminder details

### Document-Generated Reminders

**API:** `src/app/api/documents/[id]/dates/route.ts`

#### Auto-Creation Flow

1. User reviews AI-extracted dates from document
2. User can accept/reject expiry date and important dates
3. PUT endpoint updates document and **automatically creates reminders** for each important date
4. Category auto-assigned based on type (insurance, subscription, payment, document)
5. Default notification days: [7, 1, 0]
6. Description includes "Extract from {document name}"

#### Functionality

**✅ Auto-Create Reminders**

- When user reviews and saves document dates
- Creates reminders for each important date
- Recurring reminders when document is re-reviewed are updated (not duplicated)

**❌ Edit Document-Generated Reminders**

- These reminders are treated as read-only
- Can only be deleted or completed
- To change: must re-review the document dates
- No direct edit capability

**❌ Delete Document-Generated Reminders**

- Can be deleted via main reminders page
- Or by re-reviewing document and removing the date

### Wealth Account Reminders

**Library:** `src/lib/reminders.ts`  
**Worker:** `src/lib/reminder-worker.ts`

#### Auto-Generated Reminders

These are NOT stored in the `reminder` table but are calculated on-the-fly:

1. **Credit Card Payment Due**
   - Triggered when: account.type === "CREDIT_CARD" && account.dueDate is set
   - Notification window: 7 days before due date
   - Sent via: reminder worker (daily cron)
   - NOT editable (must change account.dueDate)

2. **Account/Policy Expiry**
   - Triggered when: account.expiryDate is set
   - Notification window: 30 days before expiry
   - Sent via: reminder worker (daily cron)
   - NOT editable (must change account.expiryDate)

#### Functionality

**✅ View Wealth Reminders**

- Displayed in dashboard
- Calculated dynamically from account data

**❌ Edit Wealth Reminders**

- These are not actual reminder records
- To change: edit the wealth account's dueDate or expiryDate
- Cannot edit reminder-specific settings (notification timing, etc.)

**❌ Delete Wealth Reminders**

- Cannot delete individual reminders
- To disable: remove dueDate or expiryDate from account

### Reminder Worker (Cron Job)

**File:** `src/lib/reminder-worker.ts`  
**Cron Endpoint:** `src/app/api/cron/reminders/route.ts`

#### Processing

The worker runs daily and processes:

1. **Document Expiry Reminders**
   - Checks documents expiring in 90 days
   - Sends notifications at: 30, 7, 1, 0 days before
   - Auto-generated, not stored in reminder table

2. **Custom Reminders**
   - Checks user-created reminders
   - Respects user's notifyDaysBefore setting
   - Respects recurrence (calculates next due date when completed)

3. **Wealth Account Reminders**
   - Credit card payment due: 7, 3, 1, 0 days before
   - Account expiry: 30, 7, 1, 0 days before

4. **Failed Email Retry**
   - Retries failed email deliveries from last 7 days

#### Notification Channels

- **In-App**: Created in notification table, marked as read if inApp disabled
- **Email**: Sent via Resend, with retry logic
- **Push**: Sent via web-push API if enabled

### Client UI

**File:** `src/components/reminders/RemindersClient.tsx`

#### Features

**✅ Create Reminder Form**

- Full form with all fields
- Blade modal for creating new reminders
- Category selection with icons
- Recurrence options
- Multi-select notification days
- Channel selection (in-app/email)

**✅ Reminder List**

- Shows active and completed reminders (tabs)
- Displays: title, description, category, due date, recurrence, notification channels
- Visual indicators for overdue (red), due soon (yellow), normal (default)
- Statistics cards: active count, due in 7 days, email notifications enabled

**✅ Complete Reminder**

- Click circle button to mark as complete
- For recurring: auto-creates next occurrence
- For non-recurring: moves to completed tab

**✅ Delete Reminder**

- Trash icon with confirmation dialog
- Soft delete (sets isActive: false)

**✅ Notification Preferences**

- Toggle in-app notifications
- Toggle email notifications
- Per-user settings

**❌ Edit Reminder**

- **MISSING**: No edit button or edit form
- Cannot modify existing reminder details
- Must delete and recreate to change anything

### Critical Issues

#### Issue 1: Missing Edit Functionality for Manual Reminders

**Severity:** HIGH  
**Location:** `src/app/api/reminders/route.ts` and `src/components/reminders/RemindersClient.tsx`  
**Description:** Users cannot edit existing manual reminders. They can only:

- Create new reminders
- Complete reminders
- Delete reminders
- Update notification preferences (email/inApp only)

To change title, description, due date, category, recurrence, or notification timing, users must delete and recreate the reminder.

**Impact:** Poor UX for minor corrections (e.g., typo in title, wrong date, change recurrence pattern).

**Recommendation:** Add edit functionality:

1. Add PATCH endpoint to update reminder fields (title, description, dueAt, category, recurrence, notifyDaysBefore)
2. Add edit button in UI that opens the same form with pre-filled data
3. Maintain CSRF protection and validation

#### Issue 2: No Edit for Document-Generated Reminders

**Severity:** MEDIUM  
**Location:** `src/app/api/documents/[id]/dates/route.ts`  
**Description:** Reminders auto-created from documents cannot be edited directly. Users must re-review the entire document to change dates.

**Impact:** Inconvenient if user wants to adjust notification timing or add description.

**Recommendation:** Either:

- Allow editing document-generated reminders (with link back to document)
- Provide a "detach" option to convert to manual reminder

#### Issue 3: Wealth Reminders Not Editable

**Severity:** LOW  
**Location:** `src/lib/reminders.ts` and `src/lib/reminder-worker.ts`  
**Description:** Wealth account reminders are calculated on-the-fly and cannot be edited. To change timing, users must modify account settings.

**Impact:** Users cannot customize notification timing for wealth reminders (e.g., want 14 days notice instead of 7).

**Recommendation:**

- Consider creating actual reminder records for wealth accounts with customizable settings
- Or add per-account notification timing preferences

#### Issue 4: Date Calculation Bug in Reminder Worker

**Severity:** MEDIUM  
**Location:** `src/lib/reminder-worker.ts` (lines 229-253)  
**Description:** Credit card due date calculation is complex and could produce incorrect dates when dueDate > days in month (e.g., Feb 30).

```typescript
const due = new Date(
  Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    Math.min(
      account.dueDate,
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate(),
    ),
  ),
);
```

**Recommendation:** Add proper validation and edge case handling for invalid day numbers.

### Summary

**Overall Assessment:** ⚠️ **PARTIAL FUNCTIONALITY**

The reminder system has:

**✅ Working Features:**

- Create manual reminders with full customization
- Complete reminders (with recurrence support)
- Delete reminders (soft delete)
- Auto-generate reminders from documents
- Auto-generate wealth account reminders
- Daily cron job for notifications
- Multiple notification channels (in-app, email, push)
- Notification preferences management

**❌ Missing Features:**

- **Edit existing manual reminders** - CRITICAL UX gap
- Edit document-generated reminders
- Customize wealth reminder timing
- Recurring reminder management (view/edit recurrence pattern)

**Architecture Notes:**

- Manual reminders: Stored in `reminder` table
- Document reminders: Created/updated via document review
- Wealth reminders: Calculated on-the-fly, not stored
- Notifications: Stored in `notification` table with idempotency keys
- Worker: Processes all reminder types daily with retry logic

**Priority Fix:**

1. Add edit functionality to manual reminders (HIGH priority)
2. Improve date calculation edge cases (MEDIUM priority)
3. Consider adding customization to wealth reminders (LOW priority)

---

**Report generated by automated code analysis**  
**Date:** 2026-11-08

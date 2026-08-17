# Build a Private Family Document Vault

Build a production-quality, secure, mobile-friendly web application for storing and managing personal and family documents.

The application is a private document vault. It will be deployed publicly on Vercel, but **documents and document metadata must never be publicly accessible**. Authentication and authorization must be enforced for every protected operation.

The application should support personal documents such as:

- Government documents
- Education certificates
- Employment/job documents
- Medical prescriptions
- Medical reports
- Insurance documents
- Bank documents
- Financial documents
- Other personal documents

The application must support multiple independent users. There is **no admin/family-head/father role**. Every registered user is a standard user.

---

# 1. Technology Stack

Use:

- Next.js with App Router
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- PostgreSQL
- Supabase PostgreSQL through the Vercel/Supabase integration
- Prisma ORM
- Google authentication
- Vercel Blob for document storage
- Gemini API for optional AI processing
- Yarn as package manager

Do not introduce unnecessary architectural abstractions, microservices, or enterprise patterns.

Prefer a straightforward Next.js application with server-side authorization.

Use Server Components by default and Client Components only where interactivity requires them.

---

# 2. Authentication

Use Google OAuth authentication.

Any Google account may register and use the application.

There are no invitations required to create an account.

Every authenticated Google account gets its own user account.

Unauthenticated users may see only public application/authentication pages.

They must never be able to access:

- Documents
- Folders
- Tags
- AI summaries
- AI extracted text
- Shared folders
- File metadata
- Download/view endpoints

Authentication must be checked server-side.

Do not rely solely on hiding UI elements for security.

---

# 3. Core Security Principle

The most important rule of the application is:

> A user can only access documents that they own or documents that have been explicitly shared with them through a folder share.

Never trust:

- IDs supplied by the browser
- Folder IDs
- Document IDs
- User IDs
- Blob URLs
- Query parameters

Every server-side operation must verify authorization against the database.

For example, requesting:

`/api/documents/{documentId}`

must first determine whether the authenticated user:

1. owns the document, OR
2. has read-only access through a folder shared with them.

If neither is true, return an appropriate authorization error.

Never expose private Vercel Blob URLs directly as permanent public URLs.

Use Vercel Blob private storage.

Any document viewing/download operation must go through an authorized server-side flow.

---

# 4. User Model

Every user is an independent standard user.

A user has:

- ID
- Google account identifier
- Name
- Email
- Profile image if available
- Created timestamp
- Updated timestamp

There is no admin role.

There is no family hierarchy.

There is no special father/mother/child role.

All users have the same capabilities for their own content.

---

# 5. Document Ownership

Every folder belongs to exactly one user.

Every document belongs to exactly one user and one folder.

Example:

User A:

```text
User A
└── Medical
    ├── prescription.pdf
    ├── blood-report.pdf
    └── xray.jpg
```

User B:

```text
User B
└── Education
    ├── degree.pdf
    └── certificate.pdf
```

User A cannot access User B's documents unless User B explicitly shares a folder with User A.

---

# 6. Folder System

Users can create their own folder hierarchy.

Do not impose a fixed folder structure.

A user may create:

```text
Government
Education
Medical
Employment
Bank
Insurance
Personal
```

or any structure they prefer.

Folders should support nesting.

Example:

```text
Medical
├── Prescriptions
├── Reports
└── Insurance
```

A folder should have at least:

- ID
- Owner ID
- Parent folder ID, nullable
- Name
- Created timestamp
- Updated timestamp

Users can:

- Create folder
- Rename folder
- Delete folder
- Move folder
- Create nested folders
- Share folder
- Remove folder sharing

When deleting a folder, carefully define cascading behavior for contained documents and nested folders. Do not accidentally orphan documents.

Prefer a confirmation dialog for destructive operations.

---

# 7. Folder Sharing

Sharing is performed at the **folder level**.

Inside folder properties/settings, provide a sharing section.

The owner can:

1. Search/select another registered user.
2. Share the folder with that user.
3. Give them read-only access.

Example:

```text
Medical
  Properties
    Sharing

    Shared with:
    John Doe <john@gmail.com>
    Permission: Read only
```

There should be no write permission in v1.

A shared folder automatically grants access to:

- Existing documents inside the folder
- Future documents uploaded to the folder
- Nested folders
- Documents inside nested folders

Therefore folder sharing should behave recursively.

---

# 8. Nested Folder Sharing

Nested folders can independently have sharing rules.

Example:

```text
Medical
├── Prescriptions
└── Reports
```

The owner may:

```text
Share Medical → User A
Share Medical/Reports → User B
```

Sharing a parent folder gives access to its entire subtree.

Sharing a child folder gives access only to that child folder and its descendants.

Implement authorization accordingly.

Do not duplicate document-level permissions unnecessarily.

Folder permissions should be the source of truth.

---

# 9. Read-Only Users

A shared user can:

- View shared folders
- Browse shared nested folders
- View shared documents
- Download shared documents
- View document metadata
- View tags
- View AI summaries
- View AI interpretation
- Search documents they are allowed to access

A shared user cannot:

- Upload documents
- Delete documents
- Rename documents
- Move documents
- Delete folders
- Rename folders
- Move folders
- Modify tags
- Generate AI summaries
- Regenerate AI summaries
- Modify AI results
- Share the folder with another user
- Change sharing permissions

Read-only access must be enforced server-side.

---

# 10. Unsharing

The owner can remove a folder share.

When a share is removed:

- The recipient immediately loses access to that folder.
- The recipient loses access to all documents in that folder.
- The recipient loses access to nested folders/documents inherited through that share.

The owner can share the folder with the same user again later.

Do not delete the owner's documents when unsharing.

---

# 11. Document Types

Version 1 supports only:

- PDF
- JPEG
- PNG
- WebP if practical

Do not add Word, Excel, video, ZIP, or arbitrary file types in v1.

Validate MIME type and file extension server-side.

Do not trust the browser-provided MIME type alone.

Add sensible file-size limits and make the limit configurable through environment/configuration.

---

# 12. Document Upload

The upload UI should allow the user to:

- Select folder
- Select PDF/image
- Enter/confirm document name
- Add free-form tags
- Optionally enable:

```text
Generate AI Summary
```

Example:

```text
Upload Document

File:
blood-report.pdf

Folder:
Medical / Reports

Tags:
medical, blood-test, 2026

☑ Generate AI Summary

[Upload]
```

Tags should be user-defined/free-form.

Allow multiple tags.

Normalize tags consistently for searching while preserving a user-friendly display format.

---

# 13. Upload Flow

The document must be successfully uploaded even if AI processing fails.

The flow should be:

```text
User selects document
        ↓
Validate file
        ↓
Upload to private Vercel Blob
        ↓
Create document database record
        ↓
Save tags
        ↓
If AI processing requested
        ↓
Create AI processing job/state
        ↓
Process with Gemini
        ↓
Save AI result
```

AI processing must NOT determine whether the original document upload succeeds.

If Gemini fails:

```text
Document: Uploaded successfully

AI Summary:
Processing failed

[Retry AI Processing]
```

The user must be able to retry later.

---

# 14. AI Processing

Use Gemini API.

AI processing occurs **after the document has been uploaded**.

Only the document owner can initiate or retry AI processing.

Read-only users can only view an existing AI result.

They cannot trigger AI processing.

The original uploaded file should be passed to Gemini.

Do not perform local OCR in v1.

The purpose of sending the original PDF/image to Gemini is to allow Gemini to understand scanned documents and extract text.

Gemini supports document understanding and OCR-like extraction for scanned PDFs, including visual content. Use the current Gemini API/document-processing capabilities rather than implementing a separate OCR engine. 

---

# 15. Gemini Processing Output

Gemini should return a structured result.

At minimum store:

```text
extractedText
summaryMarkdown
interpretationMarkdown
```

Also store:

```text
processingStatus
processedAt
errorMessage
modelUsed
```

Possible processing states:

```text
NOT_REQUESTED
QUEUED
PROCESSING
COMPLETED
FAILED
```

Do not overwrite the original file.

---

# 16. Generic AI Summary

The AI should produce a generic summary rather than having hard-coded summary templates for medical, financial, government, etc.

For example:

```markdown
## Summary

This document is a blood test report dated 15 August 2026.

## Key Information

- Patient: ...
- Report date: ...
- Laboratory: ...

## Important Findings

- ...
- ...
- ...

## Dates

- Report date: ...
```

The actual output should depend on the document.

The model should not invent missing information.

If information is unavailable, explicitly say that it is not present in the document.

---

# 17. AI Interpretation

Gemini may provide interpretation.

For example, for a medical report it may explain what the document appears to indicate.

The interpretation must be Markdown.

The system prompt should clearly instruct Gemini:

- Do not invent facts.
- Distinguish document facts from interpretation.
- Mention uncertainty.
- Do not claim to be a doctor.
- For medical documents, provide informational interpretation rather than diagnosis.
- Do not recommend stopping/changing medication.
- Preserve important numerical values and units.
- Do not omit potentially important abnormal findings.
- Do not fabricate patient information.
- If the document is unclear, explicitly state that.

The UI should clearly label AI-generated content as AI-generated.

---

# 18. Extracted Text

Store the extracted text generated from the document.

This text should be treated as derived AI data, not as the authoritative document.

The original PDF/image always remains the source of truth.

The extracted text can later be used for full-text search.

Do not modify the original document based on extracted text.

---

# 19. Gemini Response Format

Prefer Gemini structured output/JSON schema rather than trying to parse arbitrary Markdown responses.

Conceptually use:

```json
{
  "extractedText": "string",
  "summaryMarkdown": "string",
  "interpretationMarkdown": "string"
}
```

Validate the response before saving it.

If Gemini returns malformed/unusable data:

- Mark processing as FAILED
- Preserve the uploaded document
- Store a safe error state
- Allow retry

Do not expose Gemini API errors directly to the end user if they contain sensitive/internal information.

Gemini supports structured output using JSON schemas, so use that capability where supported by the selected model/API.

---

# 20. Gemini File Handling

Do not expose the Gemini API key to the browser.

All Gemini API calls must happen server-side.

The browser should never receive:

```text
GEMINI_API_KEY
```

or any other secret.

For larger files or repeated processing, use the appropriate Gemini file-upload mechanism rather than unnecessarily embedding huge files directly into requests.

Gemini's current documentation recommends the Files API for larger/reused documents.

---

# 21. Search

The main navigation bar should contain a global search field.

Search should operate only across content the authenticated user is authorized to see.

Search fields should include:

- Document name
- Folder name
- Tags
- AI summary text

Also store extracted text so full-document text search can be added later.

The search must never return another user's private document.

Search results should clearly indicate whether a document is:

```text
Owned by me
```

or

```text
Shared with me
```

if useful in the UI.

Example:

```text
Search: passport

Results

Passport.pdf
Government / Identity
Tags: passport, government

Passport Renewal.pdf
Government / Passport
Tags: passport, renewal
```

Search should support partial matching.

Use PostgreSQL search capabilities rather than loading all documents into the browser.

Design the database so PostgreSQL full-text search can be used efficiently as the document collection grows.

---

# 22. Document Detail Page

When opening a document, show:

```text
Document Name

Folder:
Medical / Reports

Tags:
medical
blood-test
2026

Uploaded:
15 Aug 2026

Owner:
You
```

Then provide:

```text
Preview

AI Summary

AI Interpretation

Extracted Text
```

The original file should be viewable/downloadable only after authorization.

For PDFs, provide a browser-friendly PDF viewer where practical.

For images, display the image securely.

---

# 23. Document Properties

Document properties should allow the owner to:

- Rename
- Move to another folder
- Add/remove tags
- Generate AI summary
- Retry failed AI processing
- Delete

Read-only users should only be able to view the properties they are allowed to see.

---

# 24. Folder Properties

Folder properties should allow the owner to:

- Rename
- Move
- Delete
- Share
- Remove sharing

Include a sharing section:

```text
Shared With

John Doe
Read only
[Remove]
```

Allow selecting an existing registered user.

Do not allow sharing with arbitrary email addresses that don't correspond to registered users in v1.

---

# 25. Dashboard

Create a clean dashboard showing:

- Recent documents
- Recently added documents
- AI processing status
- My folders
- Shared with me
- Quick upload button

Potential layout:

```text
Dashboard

[ Search documents... ]

Recent Documents

Medical Report.pdf
Passport.pdf
Degree Certificate.pdf

My Folders

Medical
Government
Education
Employment

Shared With Me

Father's Medical
Family Insurance
```

Do not use the concept of "admin documents" or "family documents."

Everything belongs to a user.

---

# 26. Navigation

Desktop:

```text
Logo

Search

Dashboard
My Documents
Shared With Me
Folders
Tags

Profile
```

Mobile:

Use a mobile-friendly navigation pattern such as:

```text
Bottom navigation / mobile menu

Home
Documents
Shared
Search
Profile
```

The upload action should remain easy to access on mobile.

---

# 27. Mobile-First UX

This application will primarily contain sensitive personal documents and should work extremely well on mobile.

Requirements:

- Responsive layout
- Touch-friendly controls
- Large upload button
- Mobile file picker
- Camera upload where supported by the browser
- Responsive document viewer
- Responsive search
- Bottom navigation or suitable mobile navigation
- No horizontally scrolling desktop layouts
- Dialogs should work properly on small screens

---

# 28. PWA

Make the application PWA-friendly if practical.

Allow users to install it on their mobile device.

However, do not cache private documents in an unsafe way.

Do not use a service worker strategy that accidentally caches authenticated document responses and exposes them to another user/device session.

Authentication and private document security take priority over aggressive offline support.

Offline document access is NOT required in v1.

---

# 29. Database Design

Use Prisma with PostgreSQL.

Design tables/entities similar to:

```text
User
Folder
Document
Tag
DocumentTag
FolderShare
AiProcessing
```

Potential relationships:

```text
User
 ├── owns Folders
 ├── owns Documents
 ├── owns FolderShares
 └── receives FolderShares

Folder
 ├── belongs to User
 ├── has parent Folder
 ├── contains Documents
 ├── contains child Folders
 └── has FolderShares

Document
 ├── belongs to User
 ├── belongs to Folder
 ├── has Tags
 └── has AI processing result
```

Do not store actual binary files in PostgreSQL.

Store them in Vercel Blob and store the necessary Blob reference/path metadata in PostgreSQL.

Vercel Blob is intended for unstructured files such as images and other media and supports private access modes.

---

# 30. Important Database Authorization Rules

Every document query must be scoped by the current user.

Conceptually:

```text
document.ownerId = currentUser.id
OR
document.folder is inside a folder subtree
that has a valid share with currentUser.id
```

Do not retrieve all documents and filter them in React.

Authorization must happen before returning data.

Apply the same principle to:

- Folder queries
- Document queries
- Search
- Downloads
- AI processing
- Sharing
- Deletion
- Renaming
- Moving
- Tag editing

---

# 31. Sharing Authorization

A user has access to a document when:

```text
Document owner === current user
```

OR:

```text
A folder containing the document
or one of its ancestors
has been shared with current user
```

The sharing permission is:

```text
READ_ONLY
```

for v1.

Implement this logic centrally so different routes don't accidentally implement different permission rules.

---

# 32. Private Blob Access

Vercel Blob must be configured for private document storage.

Never assume that hiding a Blob URL is sufficient security.

The application must authorize the user before serving/downloading a document.

Recommended conceptual flow:

```text
Browser
   ↓
Authenticated request
   ↓
Next.js server
   ↓
Check user permission
   ↓
If authorized
   ↓
Retrieve private Blob
   ↓
Return file securely
```

Never expose the Blob storage token to the browser.

Never put private Blob access credentials in client-side JavaScript.

---

# 33. Upload Security

Validate:

- Authenticated user
- File type
- File size
- File extension
- MIME type
- Folder ownership
- Upload permissions

A user must only be able to upload into folders they own.

A user must never upload into a folder shared with them as read-only.

Do not trust client-side validation.

Repeat important validation on the server.

---

# 34. Destructive Operations

Require confirmation before:

- Delete document
- Delete folder
- Remove folder with contents

Use clear messages.

Example:

```text
Delete "Medical Reports"?

This will delete the folder and its documents.
This action cannot be undone.

[Cancel] [Delete]
```

Do not silently delete large amounts of data.

---

# 35. No Document Versioning

Do not implement document versioning.

If a user uploads a new file, it is a separate document unless the user explicitly replaces/deletes the old one.

Do not build version history in v1.

---

# 36. No User Deletion

Do not implement account/user deletion in v1.

Users can manage their own:

- Folders
- Documents
- Tags
- Shares

but there is no "Delete account" feature.

---

# 37. No Admin Role

Do not create:

```text
ADMIN
OWNER_ADMIN
FAMILY_ADMIN
SUPER_ADMIN
```

roles.

All users are standard users.

Ownership is represented by relationships, not by an admin role.

---

# 38. Error Handling

Errors should be user-friendly.

Examples:

```text
Unable to upload document.
Please try again.
```

```text
Document uploaded, but AI processing failed.
You can retry from document properties.
```

```text
You don't have permission to access this document.
```

Do not expose:

- Stack traces
- Database errors
- API keys
- Blob tokens
- Internal paths
- Gemini raw errors

to users.

Log useful technical information server-side.

---

# 39. AI Processing UX

After upload:

```text
Document uploaded successfully.

AI Summary
⏳ Processing...
```

Once complete:

```text
AI Summary
✓ Ready
```

If failed:

```text
AI Summary
⚠ Processing failed

[Retry]
```

Do not block navigation while Gemini is processing.

The user should be able to continue using the application.

The AI processing should be asynchronous from the user's perspective.

Because Vercel/serverless execution has runtime constraints, design the processing workflow so the upload request itself does not depend on completing a long Gemini request.

---

# 40. AI Retry

Retry must:

- Verify current user owns the document
- Verify the document still exists
- Re-run Gemini processing
- Update processing status
- Preserve previous successful result if appropriate until the new result succeeds
- Record failure if retry fails

Only the owner can retry.

---

# 41. AI Prompt Design

Create a dedicated server-side Gemini prompt.

The prompt should instruct Gemini to:

1. Examine the complete uploaded document.
2. Extract meaningful text/content.
3. Preserve important numbers, dates, names, identifiers, units and other factual information.
4. Produce a concise generic summary in Markdown.
5. Produce a useful interpretation in Markdown.
6. Clearly distinguish facts from interpretation.
7. Never invent information.
8. Explicitly say when something is unclear or unavailable.
9. For medical documents, avoid presenting interpretation as a diagnosis.
10. Preserve important medical values and medication names exactly where possible.
11. Handle scanned documents using its document/image understanding capabilities.
12. Return the result according to the application's structured schema.

Do not create separate hard-coded AI workflows for prescriptions, blood reports, passports, etc. in v1.

The AI should intelligently summarize whatever document is supplied.

---

# 42. Environment Variables

Keep all secrets server-side.

Expected configuration should include appropriate variables for:

```text
DATABASE_URL
DIRECT_DATABASE_URL / appropriate Prisma connection configuration
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
AUTH_SECRET / equivalent authentication secret
BLOB_READ_WRITE_TOKEN
GEMINI_API_KEY
```

Use the exact variables required by the selected libraries.

Never expose secrets through `NEXT_PUBLIC_*`.

Document all required environment variables in `.env.example`.

---

# 43. Deployment

The target deployment environment is Vercel.

The application should work locally and on Vercel.

Database:

```text
Supabase PostgreSQL
```

connected through Vercel/Supabase integration where appropriate.

Storage:

```text
Vercel Blob
```

Authentication:

```text
Google OAuth
```

AI:

```text
Gemini API
```

Vercel provides an official Supabase integration and Next.js/Supabase starter patterns, so keep the implementation compatible with the current Vercel/Supabase deployment model.

---

# 44. Database Migrations

Use Prisma migrations.

Do not manually modify production database structure without migrations.

Provide:

- Initial migration
- Seed script only if genuinely useful
- Prisma schema
- Clear migration instructions

Do not create fake production users in seed data.

---

# 45. Testing

Implement tests for the most important security rules.

At minimum test:

### Ownership

```text
User A can access User A document
User B cannot access User A document
```

### Sharing

```text
User A shares folder with User B
User B can view folder
User B can view existing documents
User B can view future documents
```

### Read-only

```text
User B cannot rename
User B cannot delete
User B cannot upload
User B cannot change tags
User B cannot generate AI
User B cannot share folder
```

### Unsharing

```text
User A removes share
User B immediately loses access
```

### Nested sharing

```text
Parent shared → child accessible
Child shared → sibling inaccessible
```

### Search

```text
Search only returns authorized documents
```

### Blob access

```text
Unauthorized user cannot retrieve private file
```

Security tests are more important than achieving a high percentage of superficial UI test coverage.

---

# 46. Auditability

Because this application contains highly sensitive information, design the architecture so important security events can be audited later.

Consider an optional audit log entity for:

- Document upload
- Document deletion
- Folder sharing
- Folder unsharing
- AI processing
- AI retry

Do not log document contents, extracted medical information, or sensitive file contents into normal application logs.

If implementing audit logs in v1, keep them minimal and privacy-conscious.

---

# 47. UI Design

Use a clean, modern document-management interface.

Avoid making it look like Google Drive or Dropbox exactly.

The primary focus should be:

- Fast document access
- Clear ownership
- Clear shared access
- Easy mobile upload
- Easy search
- Simple folders
- Clear AI processing status

Use shadcn/ui components.

Support light and dark mode if straightforward, but do not allow visual customization to complicate the application architecture.

---

# 48. Main Pages

Implement approximately:

```text
/
```

Landing/login page.

```text
/dashboard
```

Dashboard.

```text
/documents
```

All owned documents.

```text
/shared
```

Documents/folders shared with the current user.

```text
/folders/[folderId]
```

Folder contents.

```text
/documents/[documentId]
```

Document details/preview.

```text
/search
```

Search results.

```text
/settings
```

Basic user/application settings.

Use route protection for all authenticated pages.

---

# 49. Search UI

The search box should be available prominently in the navbar.

Search example:

```text
🔍 Search documents...
```

Search:

```text
passport
```

could match:

```text
Passport.pdf
Government/Passport
Tags: passport, identity
AI Summary: Passport issued by...
```

Results must be permission-aware.

Do not show inaccessible documents even if the search term matches.

---

# 50. Important Security Anti-Patterns

Do NOT:

- Store private documents in public Blob storage.
- Expose Blob access tokens to clients.
- Put Gemini API keys in client code.
- Trust client-side authorization.
- Check authorization only in UI.
- Filter unauthorized documents only after fetching them.
- Use predictable public file URLs as security.
- Store sensitive document contents in application logs.
- Return another user's metadata from API endpoints.
- Allow shared users to manipulate folders.
- Let read-only users trigger Gemini.
- Allow arbitrary users to access files by guessing IDs.
- Assume obscurity of a URL provides security.

---

# 51. Implementation Approach

Build the application incrementally.

Phase 1:

- Project setup
- Authentication
- Database
- Prisma
- User model
- Basic dashboard

Phase 2:

- Folder hierarchy
- Document upload
- Private Vercel Blob storage
- Document viewing/download
- Ownership authorization

Phase 3:

- Tags
- Search
- Document properties
- Folder properties

Phase 4:

- Folder sharing
- Nested folder permissions
- Read-only access
- Shared-with-me page

Phase 5:

- Gemini integration
- AI processing status
- Extracted text
- Summary
- Interpretation
- Retry

Phase 6:

- Mobile optimization
- PWA
- Security hardening
- Testing
- Deployment configuration

Do not attempt to implement everything as one giant component.

Keep the implementation understandable.

---

# 52. Important Development Rule

Before making an architectural decision that affects:

- Security
- Authentication
- Authorization
- Database structure
- File storage
- Sharing
- Gemini processing
- Data privacy

do not silently guess.

If a requirement is ambiguous, ask for clarification.

Do not replace one technology in this specification with another without explaining why and getting approval.

---

# 53. Definition of Done

The application is considered complete when:

- Users can sign in with Google.
- Each user has isolated private documents.
- Users can create arbitrary folder structures.
- Users can upload PDFs/images.
- Files are stored privately in Vercel Blob.
- Users can rename/move/delete their own documents.
- Users can add free-form tags.
- Users can search their documents.
- Users can share folders with other registered users.
- Sharing automatically applies to future uploads.
- Nested folder sharing works correctly.
- Shared users have read-only access.
- Shared users cannot modify anything.
- Owners can remove sharing.
- Users can see their own documents and documents shared with them.
- AI processing happens after upload.
- AI failure does not fail document upload.
- Failed AI processing can be retried.
- Only owners can generate/retry AI processing.
- Gemini processes the original document.
- Gemini can extract text from scanned documents.
- AI summary is stored as Markdown.
- AI interpretation is stored as Markdown.
- Extracted text is stored.
- Search can use filename, folder, tags and AI summary.
- Unauthorized users cannot access private documents.
- Private Blob files cannot be accessed simply by knowing their URL.
- Gemini API credentials are never exposed to the browser.
- The application works on mobile.
- The application deploys successfully to Vercel.
- PostgreSQL runs through Supabase.
- Security/authorization tests cover ownership and sharing boundaries.

---

# 54. Final Principle

This is a **personal/family sensitive-data vault**, not a normal file-sharing application.

When there is a tradeoff between:

```text
Convenience
vs
Privacy/Security
```

choose privacy/security.

When there is a tradeoff between:

```text
Complex architecture
vs
Simple understandable architecture
```

choose the simplest architecture that provides the required security.

Do not add features that are not requested.

Do not add public file sharing.

Do not add administrator privileges.

Do not add document versioning.

Do not add OCR infrastructure outside Gemini.

Do not add account deletion.

Keep the system focused on:

```text
Private Documents
      +
Folders
      +
Tags
      +
Secure Family Sharing
      +
Gemini AI Understanding
      +
Mobile Access
```
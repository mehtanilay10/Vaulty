import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptGmailRefreshToken, createAuthorizedGmail } from "@/lib/gmail/oauth";
import {
  refreshOutlookAccessToken,
  getOutlookMessages,
  getOutlookPdfAttachments,
} from "@/lib/outlook/oauth";
import { extractGmailMessageText } from "@/lib/gmail/parse-transaction-email";
import {
  cleanAddress,
  toOutlookClassificationEmail,
  loadGmailPdfAttachments,
} from "@/lib/sync/email-sync-engine";

const DOWNLOAD_DIR = process.env.LOCAL_EMAILS_DIR || "D:\\TempHub\\Emails";
const ATTACHMENTS_DIR = path.join(DOWNLOAD_DIR, "attachments");

function sanitizeFilenamePart(text: string, maxLength = 50): string {
  if (!text) return "unknown";
  return (
    text
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, maxLength) || "unknown"
  );
}

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  name: string,
): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

export interface LocalAttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  localPath: string;
  size: number;
}

export interface LocalEmailRecord {
  messageId: string;
  threadId: string | null;
  provider: "gmail" | "outlook";
  ownerId: string;
  receivedAt: string;
  date: string;
  from: string;
  subject: string;
  body: string;
  status: "PENDING" | "EXCLUDED" | "NOT_TRANSACTION" | "IMPORTED" | "QUEUED_REVIEW" | "ERROR";
  score?: number | null;
  aiResult?: Record<string, unknown> | null;
  importedTransactionId?: string | null;
  error?: string | null;
  downloadedAt: string;
  attachments?: LocalAttachmentInfo[];
}

function getExistingMessageIds(dir: string): Set<string> {
  const existing = new Set<string>();
  if (!fs.existsSync(dir)) return existing;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith(".json") && !file.startsWith("_")) {
      try {
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        const parsed = JSON.parse(content) as Partial<LocalEmailRecord>;
        if (parsed.messageId) {
          existing.add(parsed.messageId);
        }
      } catch {
        // Skip unparseable files
      }
    }
  }
  return existing;
}

async function downloadGmail(
  userId: string,
  existingIds: Set<string>,
  options: {
    fetchAll: boolean;
    maxPages: number;
    beforeDate?: string | null;
    afterDate?: string | null;
  },
) {
  const connection = await prisma.gmailConnection.findUnique({ where: { ownerId: userId } });
  if (!connection || connection.status !== "CONNECTED") {
    console.log(`[GMAIL] User ${userId} does not have an active Gmail connection.`);
    return { downloaded: 0, skipped: 0 };
  }

  const refreshToken = decryptGmailRefreshToken(connection.refreshTokenEncrypted);
  const { gmail } = createAuthorizedGmail(refreshToken);

  const financialFilter =
    "(bank OR debited OR credited OR transaction OR statement OR card OR alert OR UPI OR NEFT OR IMPS OR payment OR spent OR withdrawn OR deposited OR transfer)";
  let query = options.fetchAll ? "-in:sent" : `-in:sent ${financialFilter}`;
  if (options.beforeDate) {
    query += ` before:${options.beforeDate.replace(/-/g, "/")}`;
  }
  if (options.afterDate) {
    query += ` after:${options.afterDate.replace(/-/g, "/")}`;
  }

  console.log(`\n============================================================`);
  console.log(`[GMAIL] Connecting to ${connection.emailAddress}...`);
  console.log(`[GMAIL] Query: "${query}" (Max pages: ${options.maxPages || "Unlimited"})`);
  console.log(`============================================================`);

  let pageToken: string | undefined = undefined;
  let pageCount = 0;
  let downloadedCount = 0;
  let skippedCount = 0;

  while (true) {
    pageCount++;
    console.log(`[GMAIL] Fetching message list page #${pageCount}...`);

    let listRes;
    try {
      listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 50,
        pageToken,
      });
    } catch (err) {
      console.error(`[GMAIL] List failed on page #${pageCount}:`, err);
      break;
    }

    const messages = listRes.data.messages || [];
    if (messages.length === 0) {
      console.log(`[GMAIL] Reached end of Gmail messages.`);
      break;
    }

    console.log(`[GMAIL] Page #${pageCount}: Found ${messages.length} message reference(s).`);

    // Fetch full messages in chunks of 10
    for (let i = 0; i < messages.length; i += 10) {
      const chunk = messages.slice(i, i + 10);
      await Promise.all(
        chunk.map(async (msgRef) => {
          if (!msgRef.id) return;
          if (existingIds.has(msgRef.id)) {
            skippedCount++;
            return;
          }

          try {
            const detail = await gmail.users.messages.get({
              userId: "me",
              id: msgRef.id,
              format: "full",
            });

            const msg = detail.data;
            const headers = msg.payload?.headers;
            const rawFrom = headerValue(headers, "from");
            const from = cleanAddress(rawFrom);
            const subject = headerValue(headers, "subject").slice(0, 500);
            const receivedAt = new Date(Number(msg.internalDate || Date.now()));
            const dateStr = receivedAt.toISOString().slice(0, 10);
            const body =
              extractGmailMessageText(
                msg.payload as Parameters<typeof extractGmailMessageText>[0],
              ) ||
              msg.snippet ||
              "";

            const cleanSubj = sanitizeFilenamePart(subject, 40);
            const cleanSender = sanitizeFilenamePart(from, 35);
            const shortId = createHash("md5").update(msgRef.id).digest("hex").slice(0, 8);

            // Check and download PDF attachments if any
            const savedAttachments: LocalAttachmentInfo[] = [];
            try {
              const pdfs = await loadGmailPdfAttachments(gmail, msgRef.id);
              if (pdfs.length > 0) {
                if (!fs.existsSync(ATTACHMENTS_DIR))
                  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
                for (const pdf of pdfs) {
                  const cleanPdfName = sanitizeFilenamePart(pdf.filename, 40);
                  const pdfFilename = `${shortId}_${cleanPdfName}`;
                  const pdfPath = path.join(ATTACHMENTS_DIR, pdfFilename);
                  fs.writeFileSync(pdfPath, pdf.data);
                  savedAttachments.push({
                    id: pdf.id,
                    filename: pdf.filename,
                    mimeType: pdf.mimeType,
                    localPath: pdfPath,
                    size: pdf.data.length,
                  });
                  console.log(
                    `    📎 [GMAIL:ATTACHMENT] Saved PDF: ${pdfFilename} (${(pdf.data.length / 1024).toFixed(1)} KB)`,
                  );
                }
              }
            } catch {
              // Ignore attachment errors
            }

            const filename = `PENDING_gmail_${dateStr}_${cleanSubj}_${cleanSender}_${shortId}.json`;
            const filePath = path.join(DOWNLOAD_DIR, filename);

            const record: LocalEmailRecord = {
              messageId: msgRef.id,
              threadId: msg.threadId || null,
              provider: "gmail",
              ownerId: userId,
              receivedAt: receivedAt.toISOString(),
              date: dateStr,
              from,
              subject,
              body,
              status: "PENDING",
              downloadedAt: new Date().toISOString(),
              ...(savedAttachments.length > 0 ? { attachments: savedAttachments } : {}),
            };

            fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
            existingIds.add(msgRef.id);
            downloadedCount++;
            console.log(`  [DOWNLOADED] ${filename}`);
          } catch (err) {
            console.error(`  [ERROR] Failed to fetch message ${msgRef.id}:`, err);
          }
        }),
      );
    }

    pageToken = listRes.data.nextPageToken || undefined;
    if (!pageToken || (options.maxPages > 0 && pageCount >= options.maxPages)) {
      break;
    }
  }

  console.log(
    `[GMAIL] Complete: ${downloadedCount} new email(s) downloaded, ${skippedCount} already on disk.`,
  );
  return { downloaded: downloadedCount, skipped: skippedCount };
}

async function downloadOutlook(
  userId: string,
  existingIds: Set<string>,
  options: {
    fetchAll: boolean;
    maxPages: number;
    beforeDate?: string | null;
    afterDate?: string | null;
  },
) {
  const connection = await prisma.outlookConnection.findUnique({ where: { ownerId: userId } });
  if (!connection || connection.status !== "CONNECTED") {
    console.log(`[OUTLOOK] User ${userId} does not have an active Outlook connection.`);
    return { downloaded: 0, skipped: 0 };
  }

  const tokens = await refreshOutlookAccessToken(connection.refreshTokenEncrypted);
  let currentAccessToken = tokens.accessToken;

  // Build Microsoft Graph date filter if specified
  const filters: string[] = [];
  if (options.beforeDate) {
    filters.push(`receivedDateTime lt ${options.beforeDate}T00:00:00Z`);
  }
  if (options.afterDate) {
    filters.push(`receivedDateTime ge ${options.afterDate}T00:00:00Z`);
  }
  const graphFilter = filters.length > 0 ? filters.join(" and ") : undefined;

  console.log(`\n============================================================`);
  console.log(`[OUTLOOK] Connecting to ${connection.emailAddress}...`);
  console.log(
    `[OUTLOOK] Fetch Mode: ${options.fetchAll ? "All messages" : "Financial keyword matching"}`,
  );
  if (graphFilter) console.log(`[OUTLOOK] Filter: "${graphFilter}"`);
  console.log(`============================================================`);

  const financialRegex =
    /\b(bank|debited|credited|transaction|statement|card|alert|upi|payment|spent|withdrawn|deposited|transfer|neft|imps|dividend|salary|refund|otp|purchase)\b/i;

  let nextLink: string | null = null;
  let pageCount = 0;
  let downloadedCount = 0;
  let skippedCount = 0;

  async function fetchAttachmentsWithAuthRetry(msgId: string) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        return await getOutlookPdfAttachments(currentAccessToken, msgId);
      } catch (err) {
        attempts++;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (/AuthenticationException|401|Unauthorized|expired|invalid_token/i.test(errMsg)) {
          console.log(
            `[OUTLOOK] Access token expired while downloading attachment. Auto-refreshing...`,
          );
          const refreshed = await refreshOutlookAccessToken(connection!.refreshTokenEncrypted);
          currentAccessToken = refreshed.accessToken;
          continue;
        }
        throw err;
      }
    }
    return [];
  }

  while (true) {
    pageCount++;
    console.log(`[OUTLOOK] Fetching message page #${pageCount}...`);

    let pageData;
    let attempts = 0;
    while (attempts < 3) {
      try {
        pageData = await getOutlookMessages(
          currentAccessToken,
          nextLink,
          nextLink ? undefined : graphFilter ? { filter: graphFilter } : undefined,
        );
        break;
      } catch (err) {
        attempts++;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (/AuthenticationException|401|Unauthorized|expired|invalid_token/i.test(errMsg)) {
          console.log(`[OUTLOOK] Access token expired. Auto-refreshing OAuth token...`);
          const refreshed = await refreshOutlookAccessToken(connection.refreshTokenEncrypted);
          currentAccessToken = refreshed.accessToken;
          continue; // retry page fetch with fresh token
        }
        console.error(`[OUTLOOK] Fetch failed on page #${pageCount} (attempt ${attempts}/3):`, err);
        if (attempts >= 3) break;
        await new Promise((r) => setTimeout(r, attempts * 2000));
      }
    }

    if (!pageData) {
      console.error(
        `[OUTLOOK] Stopping pagination at page #${pageCount} due to repeated fetch error.`,
      );
      break;
    }

    const messages = pageData.messages || [];
    if (messages.length === 0) {
      console.log(`[OUTLOOK] Reached end of Outlook messages.`);
      break;
    }

    console.log(`[OUTLOOK] Page #${pageCount}: Found ${messages.length} message(s).`);

    for (const msg of messages) {
      const messageId = `outlook:${msg.id}`;
      const shortId = createHash("md5").update(messageId).digest("hex").slice(0, 8);

      // Check date cutoffs if specified
      if (options.beforeDate && msg.receivedDateTime) {
        const msgDate = new Date(msg.receivedDateTime);
        if (msgDate >= new Date(`${options.beforeDate}T00:00:00Z`)) {
          continue;
        }
      }
      if (options.afterDate && msg.receivedDateTime) {
        const msgDate = new Date(msg.receivedDateTime);
        if (msgDate < new Date(`${options.afterDate}T00:00:00Z`)) {
          continue;
        }
      }

      if (existingIds.has(messageId)) {
        skippedCount++;
        // If message has attachments but existing record didn't save them, download attachments now
        if (msg.hasAttachments) {
          try {
            const allFiles = fs.readdirSync(DOWNLOAD_DIR);
            const targetFile = allFiles.find((f) => f.includes(`_${shortId}.json`));
            if (targetFile) {
              const fullPath = path.join(DOWNLOAD_DIR, targetFile);
              const existingRecord = JSON.parse(
                fs.readFileSync(fullPath, "utf-8"),
              ) as LocalEmailRecord;
              if (!existingRecord.attachments || existingRecord.attachments.length === 0) {
                const pdfs = await fetchAttachmentsWithAuthRetry(msg.id);
                if (pdfs.length > 0) {
                  if (!fs.existsSync(ATTACHMENTS_DIR))
                    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
                  const savedAttachments: LocalAttachmentInfo[] = [];
                  for (const pdf of pdfs) {
                    const cleanPdfName = sanitizeFilenamePart(pdf.filename, 40);
                    const pdfFilename = `${shortId}_${cleanPdfName}`;
                    const pdfPath = path.join(ATTACHMENTS_DIR, pdfFilename);
                    fs.writeFileSync(pdfPath, pdf.data);
                    savedAttachments.push({
                      id: pdf.id,
                      filename: pdf.filename,
                      mimeType: pdf.mimeType,
                      localPath: pdfPath,
                      size: pdf.data.length,
                    });
                    console.log(
                      `    📎 [OUTLOOK:ATTACHMENT] Saved PDF: ${pdfFilename} (${(pdf.data.length / 1024).toFixed(1)} KB)`,
                    );
                  }
                  existingRecord.attachments = savedAttachments;
                  fs.writeFileSync(fullPath, JSON.stringify(existingRecord, null, 2), "utf-8");
                }
              }
            }
          } catch (attErr) {
            console.warn(
              `    ⚠️ Failed to update attachments for existing message ${messageId}:`,
              attErr,
            );
          }
        }
        continue;
      }

      const normalized = toOutlookClassificationEmail(msg);

      if (!options.fetchAll) {
        const textToTest = `${normalized.subject} ${normalized.body.slice(0, 1000)}`;
        if (!financialRegex.test(textToTest) && !msg.hasAttachments) {
          // Skip non-financial message if not in --all mode (unless it has attachments)
          continue;
        }
      }

      const from = cleanAddress(normalized.from);
      const dateStr = normalized.receivedAt.toISOString().slice(0, 10);
      const cleanSubj = sanitizeFilenamePart(normalized.subject, 40);
      const cleanSender = sanitizeFilenamePart(from, 35);

      const filename = `PENDING_outlook_${dateStr}_${cleanSubj}_${cleanSender}_${shortId}.json`;
      const filePath = path.join(DOWNLOAD_DIR, filename);

      // Download PDF attachments if present
      const savedAttachments: LocalAttachmentInfo[] = [];
      if (msg.hasAttachments) {
        try {
          const pdfs = await fetchAttachmentsWithAuthRetry(msg.id);
          if (pdfs.length > 0) {
            if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
            for (const pdf of pdfs) {
              const cleanPdfName = sanitizeFilenamePart(pdf.filename, 40);
              const pdfFilename = `${shortId}_${cleanPdfName}`;
              const pdfPath = path.join(ATTACHMENTS_DIR, pdfFilename);
              fs.writeFileSync(pdfPath, pdf.data);
              savedAttachments.push({
                id: pdf.id,
                filename: pdf.filename,
                mimeType: pdf.mimeType,
                localPath: pdfPath,
                size: pdf.data.length,
              });
              console.log(
                `    📎 [OUTLOOK:ATTACHMENT] Saved PDF: ${pdfFilename} (${(pdf.data.length / 1024).toFixed(1)} KB)`,
              );
            }
          }
        } catch (attErr) {
          console.warn(`    ⚠️ Failed to download attachments for message ${messageId}:`, attErr);
        }
      }

      const record: LocalEmailRecord = {
        messageId,
        threadId: normalized.threadId || null,
        provider: "outlook",
        ownerId: userId,
        receivedAt: normalized.receivedAt.toISOString(),
        date: dateStr,
        from,
        subject: normalized.subject,
        body: normalized.body,
        status: "PENDING",
        downloadedAt: new Date().toISOString(),
        ...(savedAttachments.length > 0 ? { attachments: savedAttachments } : {}),
      };

      try {
        fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
        existingIds.add(messageId);
        downloadedCount++;
        console.log(`  [DOWNLOADED] ${filename}`);
      } catch (err) {
        console.error(`  [ERROR] Failed to save message ${messageId}:`, err);
      }
    }

    nextLink = pageData.nextLink;
    if (!nextLink || (options.maxPages > 0 && pageCount >= options.maxPages)) {
      break;
    }
  }

  console.log(
    `[OUTLOOK] Complete: ${downloadedCount} new email(s) downloaded, ${skippedCount} already on disk.`,
  );
  return { downloaded: downloadedCount, skipped: skippedCount };
}

async function main() {
  const args = process.argv.slice(2);
  const fetchAll = args.includes("--all");
  const allPages = args.includes("--all-pages");
  const maxPagesArg = args.find((a) => a.startsWith("--max-pages="));
  const maxPages = allPages ? 0 : maxPagesArg ? Number(maxPagesArg.split("=")[1]) : 50;

  const beforeArg = args.find((a) => a.startsWith("--before="));
  const beforeDate = beforeArg ? beforeArg.split("=")[1].trim() : null;

  const afterArg = args.find((a) => a.startsWith("--after="));
  const afterDate = afterArg ? afterArg.split("=")[1].trim() : null;

  const onlyGmail = args.includes("--gmail") || args.includes("--provider=gmail");
  const onlyOutlook = args.includes("--outlook") || args.includes("--provider=outlook");

  const runGmail = !onlyOutlook;
  const runOutlook = !onlyGmail;

  const targetProvider = onlyGmail
    ? "Gmail Only"
    : onlyOutlook
      ? "Outlook Only"
      : "Both (Gmail & Outlook)";

  console.log(`============================================================`);
  console.log(`Email Local Downloader`);
  console.log(`Target Directory: ${DOWNLOAD_DIR}`);
  console.log(`Provider: ${targetProvider}`);
  console.log(
    `Fetch Mode: ${fetchAll ? "ALL Inbox Emails" : "Financial / Transactional Keywords"}`,
  );
  console.log(`Page Limit: ${maxPages > 0 ? `${maxPages} pages` : "Unlimited (All pages)"}`);
  if (beforeDate || afterDate) {
    console.log(
      `Date Filter: ${beforeDate ? `Before ${beforeDate}` : ""} ${afterDate ? `After ${afterDate}` : ""}`,
    );
  }
  console.log(`============================================================`);

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    console.log(`Created target directory: ${DOWNLOAD_DIR}`);
  }

  const existingIds = getExistingMessageIds(DOWNLOAD_DIR);
  console.log(`Loaded ${existingIds.size} existing email(s) already on disk.`);

  const [gmailUsers, outlookUsers] = await Promise.all([
    runGmail
      ? prisma.gmailConnection.findMany({
          where: { status: "CONNECTED" },
          select: { ownerId: true, emailAddress: true },
        })
      : Promise.resolve([]),
    runOutlook
      ? prisma.outlookConnection.findMany({
          where: { status: "CONNECTED" },
          select: { ownerId: true, emailAddress: true },
        })
      : Promise.resolve([]),
  ]);

  console.log(
    `Found ${gmailUsers.length} Gmail and ${outlookUsers.length} Outlook account(s) to process.`,
  );

  if (runGmail) {
    for (const g of gmailUsers) {
      await downloadGmail(g.ownerId, existingIds, { fetchAll, maxPages, beforeDate, afterDate });
    }
  }

  if (runOutlook) {
    for (const o of outlookUsers) {
      await downloadOutlook(o.ownerId, existingIds, { fetchAll, maxPages, beforeDate, afterDate });
    }
  }

  const finalFiles = fs
    .readdirSync(DOWNLOAD_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  console.log(`\n============================================================`);
  console.log(`✓ Download complete. Total emails in ${DOWNLOAD_DIR}: ${finalFiles.length}`);
  console.log(
    `Run 'yarn tsx scripts/process-emails-local.ts' to filter & process them with Gemini.`,
  );
  console.log(`============================================================\n`);
}

main()
  .catch((err) => {
    console.error("Download failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

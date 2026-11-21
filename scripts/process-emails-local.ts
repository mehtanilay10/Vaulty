import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { GEMINI_MODEL, getRandomGeminiClient } from "@/lib/gemini";
import { parseTextStatement } from "@/lib/statement-parser";
import {
  areDuplicateTransactions,
  type TransactionFingerprint,
} from "@/lib/gmail/dedupe-transactions";
import {
  classifyGmailTransactionBatch,
  scoreFinancialEmails,
  type GmailEmailForClassification,
  type ClassifiedGmailTransaction,
} from "@/lib/gmail/classify-transaction-emails";
import {
  inferDiscoveredAccountType,
  formatDiscoveredAccountName,
} from "@/lib/sync/email-sync-engine";
import {
  matchFinancialAccount,
  extractAccountLastFour,
  extractAccountNumberHint,
} from "@/lib/gmail/account-matching";
import type { BankSenderClassification } from "./identify-bank-senders";
import type { LocalAttachmentInfo } from "./download-emails";

const DOWNLOAD_DIR = process.env.LOCAL_EMAILS_DIR || "D:\\TempHub\\Emails";
const SENDER_REGISTRY_PATH = path.join(DOWNLOAD_DIR, "_bank_senders.json");
const AI_CACHE_PATH = path.join(DOWNLOAD_DIR, "_gemini_ai_cache.json");

const USER_PROFILE = {
  firstName: "Nilay",
  lastName: "Mehta",
  pan: "CHTPM7813D",
  mobile: "9898210102",
  dateOfBirth: "07-10-1994", // 07 Oct 1994
};

interface LocalEmailRecord {
  messageId: string;
  threadId: string | null;
  provider: "gmail" | "outlook";
  ownerId: string;
  receivedAt: string;
  date: string;
  from: string;
  subject: string;
  body: string;
  status:
    | "PENDING"
    | "EXCLUDED"
    | "NOT_TRANSACTION"
    | "CANDIDATE"
    | "IMPORTED"
    | "QUEUED_REVIEW"
    | "ERROR";
  score?: number | null;
  aiResult?: Record<string, unknown> | null;
  importedTransactionId?: string | null;
  error?: string | null;
  downloadedAt: string;
  processedAt?: string;
  attachments?: LocalAttachmentInfo[];
}

function updateFileStatus(
  oldFilename: string,
  newStatus: LocalEmailRecord["status"],
  updates: Partial<LocalEmailRecord>,
): string {
  const oldPath = path.join(DOWNLOAD_DIR, oldFilename);
  const rawContent = fs.readFileSync(oldPath, "utf-8");
  const data = JSON.parse(rawContent) as LocalEmailRecord;

  const updatedData: LocalEmailRecord = {
    ...data,
    ...updates,
    status: newStatus,
    processedAt: new Date().toISOString(),
  };

  // Compute new filename by replacing status prefix
  // e.g., PENDING_gmail_... -> IMPORTED_gmail_...
  const firstUnderscore = oldFilename.indexOf("_");
  const remainder = firstUnderscore !== -1 ? oldFilename.slice(firstUnderscore + 1) : oldFilename;

  let prefix = newStatus.toUpperCase();
  if (newStatus === "NOT_TRANSACTION") prefix = "NOT_TX";
  if (newStatus === "QUEUED_REVIEW") prefix = "REVIEW";

  const newFilename = `${prefix}_${remainder}`;
  const newPath = path.join(DOWNLOAD_DIR, newFilename);

  fs.writeFileSync(oldPath, JSON.stringify(updatedData, null, 2), "utf-8");
  if (oldPath !== newPath) {
    fs.renameSync(oldPath, newPath);
  }

  return newFilename;
}

const MAX_EXTRACTED_TEXT_LENGTH = 2 * 1024 * 1024;

async function extractPdfText(data: Buffer, password?: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    ...(password ? { password } : {}),
  });
  let pdf: Awaited<typeof task.promise> | null = null;
  try {
    pdf = await task.promise;
    if (pdf.numPages > 500) throw new Error("PDF exceeds 500 pages limit.");
    const pages: string[] = [];
    let totalLen = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      try {
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: { str?: string } | unknown) =>
            item && typeof item === "object" && "str" in item
              ? String((item as { str: string }).str)
              : "",
          )
          .join(" ");
        totalLen += pageText.length;
        if (totalLen > MAX_EXTRACTED_TEXT_LENGTH) {
          pages.push(pageText.slice(0, MAX_EXTRACTED_TEXT_LENGTH - (totalLen - pageText.length)));
          break;
        }
        pages.push(pageText);
      } finally {
        page.cleanup();
      }
    }
    return pages.join("\n");
  } finally {
    try {
      if (pdf) await pdf.cleanup();
    } catch {}
    try {
      await task.destroy();
    } catch {}
  }
}

function extractPasswordHintSnippet(text: string): string {
  const lines = text.split("\n");
  const matching = lines.filter((l) =>
    /password|passcode|pwd|protect|format|pattern|ddmmyyyy|pan|mobile|e-statement|statement/i.test(
      l,
    ),
  );
  return matching.join(" | ").slice(0, 300) || "No explicit password instruction detected";
}

function getRuleBasedCandidates(subject: string, body: string): string[] {
  const panUpper = USER_PROFILE.pan.toUpperCase();
  const panLower = USER_PROFILE.pan.toLowerCase();
  const panFirst5Upper = panUpper.slice(0, 5);
  const panFirst5Lower = panLower.slice(0, 5);
  const panLast4Upper = panUpper.slice(-4);
  const panLast4Lower = panLower.slice(-4);

  const mobFull = USER_PROFILE.mobile;
  const mobLast4 = mobFull.slice(-4);
  const mobFirst5 = mobFull.slice(0, 5);

  const fnLower = USER_PROFILE.firstName.toLowerCase();
  const fnUpper = USER_PROFILE.firstName.toUpperCase();
  const fnFirst4Lower = fnLower.slice(0, 4);
  const fnFirst4Upper = fnUpper.slice(0, 4);

  const lnLower = USER_PROFILE.lastName.toLowerCase();
  const lnUpper = USER_PROFILE.lastName.toUpperCase();
  const lnFirst4Lower = lnLower.slice(0, 4);
  const lnFirst4Upper = lnUpper.slice(0, 4);

  // DOB variations (07 Oct 1994)
  const dobDDMMYYYY = "07101994";
  const dobDDMMYY = "071094";
  const dobDDMM = "0710";
  const dobMMDD = "1007";
  const dobYYYYMMDD = "19941007";
  const dobHyphen = "07-10-1994";
  const dobSlash = "07/10/1994";
  const dobOctUpper = "07OCT1994";
  const dobOctLower = "07oct1994";

  const set = new Set<string>();

  // 1. Standalone DOB
  set.add(dobDDMMYYYY);
  set.add(dobDDMMYY);
  set.add(dobDDMM);
  set.add(dobMMDD);
  set.add(dobYYYYMMDD);
  set.add(dobHyphen);
  set.add(dobSlash);
  set.add(dobOctUpper);
  set.add(dobOctLower);

  // 2. Name + DOB combinations (Very common for HDFC, SBI, ICICI, Axis)
  // First 4 of name + DOB in DDMM
  set.add(`${fnFirst4Lower}${dobDDMM}`); // nila0710
  set.add(`${fnFirst4Upper}${dobDDMM}`); // NILA0710
  set.add(`${fnLower}${dobDDMM}`); // nilay0710
  set.add(`${fnUpper}${dobDDMM}`); // NILAY0710
  set.add(`${fnFirst4Lower}${dobDDMMYYYY}`); // nila07101994
  set.add(`${fnFirst4Upper}${dobDDMMYYYY}`); // NILA07101994
  set.add(`${fnFirst4Lower}${dobDDMMYY}`); // nila071094
  set.add(`${fnFirst4Upper}${dobDDMMYY}`); // NILA071094

  // Last name + DOB
  set.add(`${lnFirst4Lower}${dobDDMM}`); // meht0710
  set.add(`${lnFirst4Upper}${dobDDMM}`); // MEHT0710

  // 3. PAN combinations
  set.add(panUpper);
  set.add(panLower);
  // PAN + DOB (CAMS, KFintech, CDSL, NSDL, Mutual Funds)
  set.add(`${panFirst5Upper}${dobDDMM}`); // CHTPM0710
  set.add(`${panFirst5Lower}${dobDDMM}`); // chtpm0710
  set.add(`${panUpper.slice(0, 4)}${dobDDMM}`); // CHTP0710
  set.add(`${panLower.slice(0, 4)}${dobDDMM}`); // chtp0710
  set.add(`${panLast4Upper}${dobDDMM}`); // 813D0710
  set.add(`${panLast4Lower}${dobDDMM}`); // 813d0710
  set.add(`${panUpper}${dobDDMM}`);
  set.add(`${panLower}${dobDDMM}`);

  // 4. Name + Mobile combinations
  set.add(`${fnFirst4Lower}${mobLast4}`); // nila0102
  set.add(`${fnFirst4Upper}${mobLast4}`); // NILA0102
  set.add(`${fnLower}${mobLast4}`);
  set.add(`${fnUpper}${mobLast4}`);

  // 5. Name + PAN combinations
  set.add(`${fnFirst4Lower}${panLast4Lower}`); // nila813d
  set.add(`${fnFirst4Upper}${panLast4Upper}`); // NILA813D
  set.add(`${fnFirst4Upper}${panLast4Lower}`);
  set.add(`${fnFirst4Lower}${panLast4Upper}`);

  // 6. PAN + Mobile combinations
  set.add(`${panFirst5Upper}${mobLast4}`);
  set.add(`${panFirst5Lower}${mobLast4}`);
  set.add(`${panUpper.slice(0, 4)}${mobLast4}`);
  set.add(`${panLower.slice(0, 4)}${mobLast4}`);

  // 7. Mobile standalone / partials
  set.add(mobFull);
  set.add(mobLast4);
  set.add(mobFirst5);

  // 8. Last 4 of PAN
  set.add(panLast4Upper);
  set.add(panLast4Lower);

  // 9. Name variations
  set.add(fnLower);
  set.add(fnUpper);
  set.add(`${fnLower}${lnLower}`);
  set.add(`${fnUpper}${lnUpper}`);

  // 10. Regex extract explicit password hints from email text
  const hintMatches = (subject + "\n" + body).matchAll(
    /(?:password|pwd|passcode)\s*(?:is|:|=|-)\s*([A-Za-z0-9@#$%._-]{4,32})/gi,
  );
  for (const m of hintMatches) {
    const hint = m[1]?.trim().replace(/[.,;:]+$/, "");
    if (hint && !/^(your|dob|pan|mobile|date|birth|password)$/i.test(hint)) {
      set.add(hint);
    }
  }

  return [...set];
}

async function getAiPasswordCandidates(subject: string, body: string): Promise<string[]> {
  try {
    const { ai } = getRandomGeminiClient();

    // Extract snippet around "password", "statement", "pdf", "open", "dob", "birth", "pan", "mobile"
    const relevantLines = (subject + "\n" + body)
      .split("\n")
      .filter((line) =>
        /password|passcode|statement|pdf|open|protect|format|pattern|digit|pan|dob|birth|mobile|club|combination/i.test(
          line,
        ),
      )
      .join("\n")
      .slice(0, 2500);

    if (!relevantLines.trim()) return [];

    const prompt = `You are an expert at deciphering Indian bank, credit card, mutual fund, and broker PDF statement password rules.
Analyze the following email instructions and use the provided customer profile to generate the exact password candidate string(s).
Carefully read the email text to find what elements should be clubbed/combined (e.g. first 4 letters of name, DOB in DDMM format, PAN, mobile, etc.).

Customer Profile:
- First Name: "${USER_PROFILE.firstName}" (lower: "nilay", upper: "NILAY", first 4 letters: "nila" / "NILA")
- Last Name: "${USER_PROFILE.lastName}" (lower: "mehta", upper: "MEHTA", first 4 letters: "meht" / "MEHT")
- Date of Birth: 07 Oct 1994
  * DDMM format: "0710"
  * DDMMYYYY format: "07101994"
  * DDMMYY format: "071094"
  * MMDD format: "1007"
  * Day: "07", Month: "10" (or "OCT" / "oct"), Year: "1994" (or "94")
- PAN Card: "${USER_PROFILE.pan}" (upper: "CHTPM7813D", lower: "chtpm7813d", first 5: "CHTPM" / "chtpm", last 4: "813D" / "813d")
- Mobile Number: "${USER_PROFILE.mobile}" (last 4: "0102", first 5: "98982")

Email text:
"""
${relevantLines}
"""

Instructions:
1. Carefully read the email instructions to determine what fields should be clubbed/combined (e.g., first 4 letters of name + date of birth in DDMM format -> "nila0710" or "NILA0710").
2. Follow the exact formula and casing specified in the email.
3. Return a JSON array of up to 8 candidate passwords in order of highest likelihood.
4. Return ONLY a valid JSON array of strings, e.g. ["nila0710", "NILA0710", "07101994"]. No extra text or commentary.`;

    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.1, responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(res.text?.trim() || "[]");
    return Array.isArray(parsed) ? parsed.map((s) => String(s).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isLikelyStatementPdf(
  filename: string,
  subject: string,
  body: string,
  senderInfo?: BankSenderClassification,
): boolean {
  const isBankSender =
    senderInfo?.isBankOrCard && ["BANK", "CREDIT_CARD", "BROKER"].includes(senderInfo.category);
  const text = `${filename} ${subject} ${body.slice(0, 500)}`.toLowerCase();

  // Explicitly ignore non-financial PDFs: medical reports, handbooks, boarding passes, certificates, lab reports
  if (
    /handbook|report|lab|test_report|prescription|boarding|ticket|brochure|manual|guideline|policy_document/i.test(
      filename,
    )
  ) {
    return false;
  }

  if (isBankSender) {
    return /statement|estatement|e-statement|bill|invoice|account|transact|summary/i.test(text);
  }

  // For other senders, must have explicit statement keywords
  return /statement|estatement|e-statement|account_statement|credit_card/i.test(text);
}

async function unlockPdfAndExtractText(
  pdfBuffer: Buffer,
  subject: string,
  body: string,
): Promise<{ success: boolean; text: string; passwordUsed: string | null; error?: string }> {
  // 1. Try with no password (in case not password protected)
  try {
    const text = await extractPdfText(pdfBuffer);
    return { success: true, text, passwordUsed: null };
  } catch (err) {
    const msg = String(err);
    if (!/password|encrypt/i.test(msg)) {
      return { success: false, text: "", passwordUsed: null, error: msg };
    }
  }

  // 2. Try AI-generated candidates FIRST (because they directly follow the email body's clubbing instructions)
  const aiCandidates = await getAiPasswordCandidates(subject, body);
  for (const candidate of aiCandidates) {
    try {
      const text = await extractPdfText(pdfBuffer, candidate);
      return { success: true, text, passwordUsed: candidate };
    } catch {
      // try next
    }
  }

  // 3. Fallback to comprehensive rule-based combinations
  const ruleCandidates = getRuleBasedCandidates(subject, body);
  for (const candidate of ruleCandidates) {
    if (aiCandidates.includes(candidate)) continue;
    try {
      const text = await extractPdfText(pdfBuffer, candidate);
      return { success: true, text, passwordUsed: candidate };
    } catch {
      // try next
    }
  }

  return {
    success: false,
    text: "",
    passwordUsed: null,
    error: `Password protected. Tried ${aiCandidates.length + ruleCandidates.length} candidate(s) but none unlocked the PDF.`,
  };
}

function loadAiCache(): Map<string, ClassifiedGmailTransaction | null> {
  const cache = new Map<string, ClassifiedGmailTransaction | null>();
  if (fs.existsSync(AI_CACHE_PATH)) {
    try {
      const raw = fs.readFileSync(AI_CACHE_PATH, "utf-8");
      const obj = JSON.parse(raw);
      for (const [msgId, val] of Object.entries(obj)) {
        if (!val) {
          cache.set(msgId, null);
        } else {
          const item = val as ClassifiedGmailTransaction;
          cache.set(msgId, {
            ...item,
            date: new Date(item.date),
          });
        }
      }
      console.log(
        `✓ Loaded persistent Gemini AI cache: ${cache.size} email(s) already classified.`,
      );
    } catch (err) {
      console.warn(`⚠️ Could not parse ${AI_CACHE_PATH}:`, err);
    }
  }
  return cache;
}

function saveAiCache(cache: Map<string, ClassifiedGmailTransaction | null>) {
  try {
    const obj: Record<string, unknown> = {};
    for (const [msgId, val] of cache.entries()) {
      obj[msgId] = val;
    }
    const tempPath = `${AI_CACHE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(obj, null, 2), "utf-8");
    fs.renameSync(tempPath, AI_CACHE_PATH);
  } catch (err) {
    console.warn(`⚠️ Failed to persist AI cache to disk:`, err);
  }
}

async function classifyChunkWithRetry(
  chunk: GmailEmailForClassification[],
  chunkLabel: string,
  modelOverride?: string,
): Promise<ClassifiedGmailTransaction[]> {
  const primaryModel = modelOverride || process.env.GEMINI_MODEL;
  const fallbackModel = "gemini-3.5-flash-lite";
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    // Switch to high-capacity fallback model if primary experiences 503 unavailability
    const currentModel = attempts >= 2 ? fallbackModel : primaryModel;
    try {
      return await classifyGmailTransactionBatch(chunk, {
        logPrefix: `[LOCAL:AI] ${chunkLabel}`,
        model: currentModel,
      });
    } catch (err) {
      attempts++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[LOCAL:AI] ${chunkLabel} Gemini error on ${currentModel} (attempt ${attempts}/${maxAttempts}): ${errMsg.slice(0, 100)}`,
      );

      if (attempts >= maxAttempts) {
        console.error(
          `⚠️ Skipping batch ${chunkLabel} after ${maxAttempts} failed attempts so remaining emails can continue processing without crashing.`,
        );
        return [];
      }

      const waitSeconds = Math.min(30, attempts * 3 + Math.floor(Math.random() * 3));
      console.log(
        `[LOCAL:AI] Retrying in ${waitSeconds}s (target model: ${attempts >= 1 ? fallbackModel : primaryModel})...`,
      );
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
    }
  }

  await new Promise((r) => setTimeout(r, 10000));

  return [];
}

function exportExcelReport(dir: string) {
  const allFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const rows: Array<Record<string, unknown>> = [];

  for (const filename of allFiles) {
    try {
      const content = fs.readFileSync(path.join(dir, filename), "utf-8");
      const record = JSON.parse(content) as LocalEmailRecord;
      const ai = record.aiResult as Record<string, unknown> | undefined;

      rows.push({
        Status: record.status,
        Provider: record.provider,
        Date: record.date,
        From: record.from,
        Subject: record.subject,
        Amount: ai?.amount ?? "",
        Currency: ai?.currency ?? "",
        Type: ai?.type ?? "",
        Merchant: ai?.merchant ?? "",
        Bank: ai?.bankName ?? "",
        Confidence: ai?.confidence ? Number(ai.confidence).toFixed(2) : "",
        Score: record.score ?? "",
        Reason: ai?.reason || record.error || "",
        FileName: filename,
      });
    } catch {
      // skip
    }
  }

  // Sort rows: Date desc, Status asc
  rows.sort((a, b) => {
    const dateA = String(a.Date || "");
    const dateB = String(b.Date || "");
    return dateB.localeCompare(dateA);
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Emails Summary");

  const xlsxPath = path.join(dir, "_emails_summary.xlsx");
  const csvPath = path.join(dir, "_emails_summary.csv");

  XLSX.writeFile(workbook, xlsxPath);
  const csvContent = XLSX.utils.sheet_to_csv(worksheet);
  fs.writeFileSync(csvPath, csvContent, "utf-8");

  console.log(`\n============================================================`);
  console.log(`📊 Master summary report generated:`);
  console.log(`   Excel: ${xlsxPath}`);
  console.log(`   CSV:   ${csvPath}`);
  console.log(`============================================================`);
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const skipAi = args.includes("--skip-ai");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

  const onlyGmail = args.includes("--gmail") || args.includes("--provider=gmail");
  const onlyOutlook = args.includes("--outlook") || args.includes("--provider=outlook");
  const banksOnly = args.includes("--banks-only");
  const modelArg = args.find((a) => a.startsWith("--model="));
  const selectedModel = modelArg ? modelArg.split("=")[1].trim() : undefined;
  const batchSizeArg = args.find((a) => a.startsWith("--batch-size="));
  const batchSize = batchSizeArg
    ? Math.max(1, Math.min(50, Number(batchSizeArg.split("=")[1])))
    : 20;
  const targetProvider = onlyGmail
    ? "Gmail Only"
    : onlyOutlook
      ? "Outlook Only"
      : "Both (Gmail & Outlook)";

  console.log(`============================================================`);
  console.log(`Email Local Processor & Gemini Classifier`);
  console.log(`Directory: ${DOWNLOAD_DIR}`);
  console.log(`Provider: ${targetProvider}`);
  console.log(
    `Filter: ${banksOnly ? "Strict Banks & Cards Only (No Wallets)" : "All Financial (Banks, Cards, Brokers, Wallets)"}`,
  );
  console.log(`Batch Size: ${batchSize} emails per Gemini call`);
  console.log(`Mode: ${isDryRun ? "DRY RUN (no DB writes)" : "LIVE (writing to DB)"}`);
  if (selectedModel) console.log(`Model Override: ${selectedModel}`);
  if (skipAi) console.log(`Note: --skip-ai flag enabled (skipping Gemini calls)`);
  if (Number.isFinite(limit)) console.log(`Limit: Processing first ${limit} pending email(s)`);
  console.log(`============================================================\n`);

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    console.error(`Target directory ${DOWNLOAD_DIR} does not exist. Run download-emails.ts first.`);
    return;
  }

  // Load Bank Sender Registry if available
  const registryMap = new Map<string, BankSenderClassification>();
  if (fs.existsSync(SENDER_REGISTRY_PATH)) {
    try {
      const registry = JSON.parse(
        fs.readFileSync(SENDER_REGISTRY_PATH, "utf-8"),
      ) as BankSenderClassification[];
      for (const item of registry) {
        registryMap.set(item.sender.toLowerCase().trim(), item);
      }
      console.log(`✓ Loaded Bank Sender Registry: ${registryMap.size} sender profile(s).\n`);
    } catch (regErr) {
      console.warn(`⚠️ Could not parse ${SENDER_REGISTRY_PATH}:`, regErr);
    }
  }

  const allFiles = fs.readdirSync(DOWNLOAD_DIR);
  const pendingFiles = allFiles
    .filter((f) => {
      if (!f.startsWith("PENDING_") || !f.endsWith(".json")) return false;
      if (onlyGmail && !f.startsWith("PENDING_gmail_")) return false;
      if (onlyOutlook && !f.startsWith("PENDING_outlook_")) return false;
      return true;
    })
    .slice(0, limit);

  console.log(`Found ${pendingFiles.length} pending email(s) to process.`);
  if (pendingFiles.length === 0) {
    console.log(`No pending emails found. Generating updated summary report...`);
    exportExcelReport(DOWNLOAD_DIR);
    return;
  }

  // Load active accounts from DB for matching
  const financialAccounts = await prisma.wealthAccount.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      ownerId: true,
      name: true,
      bankName: true,
      provider: true,
      accountNumber: true,
      currency: true,
      currentBalance: true,
    },
  });

  // Load existing transactions & imports for cross-deduplication (alerts vs statements)
  const [existingDbTxs, existingDbImports] = await Promise.all([
    prisma.wealthTransaction.findMany({
      select: {
        accountId: true,
        amount: true,
        currency: true,
        type: true,
        date: true,
        referenceNumber: true,
        description: true,
        account: { select: { bankName: true, name: true } },
      },
    }),
    prisma.emailTransactionImport.findMany({
      select: {
        accountId: true,
        amount: true,
        currency: true,
        type: true,
        date: true,
        referenceNumber: true,
        description: true,
        bankName: true,
      },
    }),
  ]);

  const runningFingerprints: TransactionFingerprint[] = [
    ...existingDbTxs.map((t) => ({
      amount: Number(t.amount),
      currency: t.currency,
      type: t.type,
      date: t.date,
      referenceNumber: t.referenceNumber,
      description: t.description,
      bankName: t.account?.bankName || t.account?.name,
    })),
    ...existingDbImports.map((i) => ({
      amount: Number(i.amount),
      currency: i.currency,
      type: i.type,
      date: i.date,
      referenceNumber: i.referenceNumber,
      description: i.description,
      bankName: i.bankName,
    })),
  ];

  console.log(
    `Loaded ${runningFingerprints.length} existing transaction fingerprint(s) from DB for deduplication.`,
  );

  // Step 1: Read pending files, apply Bank Sender Registry & heuristic filter
  const candidatesForAi: Array<{
    filename: string;
    record: LocalEmailRecord;
    email: GmailEmailForClassification;
    senderInfo?: BankSenderClassification;
  }> = [];

  for (const filename of pendingFiles) {
    const filePath = path.join(DOWNLOAD_DIR, filename);
    const content = fs.readFileSync(filePath, "utf-8");
    const record = JSON.parse(content) as LocalEmailRecord;

    const senderKey = (record.from || "").toLowerCase().trim();
    const senderInfo = registryMap.get(senderKey);

    // Filter using Bank Sender Registry if known
    if (registryMap.size > 0 && senderInfo) {
      const isEligible = banksOnly
        ? senderInfo.isBankOrCard && ["BANK", "CREDIT_CARD", "BROKER"].includes(senderInfo.category)
        : senderInfo.isBankOrCard;

      if (!isEligible) {
        const newFile = updateFileStatus(filename, "EXCLUDED", {
          score: 0,
          error: `Non-bank sender (${senderInfo.category}): ${senderInfo.reason || senderInfo.institution}`,
        });
        console.log(
          `  [EXCLUDED] (${senderInfo.category}) ${record.subject.slice(0, 50)} -> ${newFile}`,
        );
        continue;
      }
    }

    const email: GmailEmailForClassification = {
      messageId: record.messageId,
      threadId: record.threadId,
      from: record.from,
      subject: record.subject,
      body: record.body,
      receivedAt: new Date(record.receivedAt),
    };

    const scored = scoreFinancialEmails([email])[0];
    const score = scored ? scored.score : 0;
    const hasAttachments = Boolean(record.attachments && record.attachments.length > 0);

    // Keep candidate if score >= 3 OR if email has PDF attachments (e.g. monthly statement notifications)
    if (score < 3 && !hasAttachments) {
      const newFile = updateFileStatus(filename, "EXCLUDED", {
        score,
        error: "Heuristic score < 3 (non-financial, OTP, or promotional)",
      });
      console.log(
        `  [EXCLUDED] (Score: ${score.toFixed(1)}) ${record.subject.slice(0, 50)} -> ${newFile}`,
      );
    } else {
      candidatesForAi.push({ filename, record, email, senderInfo });
    }
  }

  console.log(
    `\n── Heuristic Filter Complete: ${candidatesForAi.length}/${pendingFiles.length} passed criteria (Score >= 3) ──\n`,
  );

  if (skipAi || candidatesForAi.length === 0) {
    exportExcelReport(DOWNLOAD_DIR);
    return;
  }

  const aiCache = loadAiCache();

  let autoImportCount = 0;
  let reviewCount = 0;
  let notTxCount = 0;
  const failedPdfStatements: Array<{
    Date: string;
    Provider: string;
    From: string;
    Subject: string;
    PdfFilename: string;
    LocalPath: string;
    Error: string;
    PasswordHintInEmail: string;
  }> = [];

  const BATCH_SIZE = batchSize;
  console.log(
    `\n── Starting End-to-End Streamed Processing (${candidatesForAi.length} candidates in batches of ${BATCH_SIZE}) ──`,
  );
  console.log(`   • Persistent Cache: ${AI_CACHE_PATH} (saved immediately per batch)`);
  console.log(`   • Real-Time DB Commits & File Renaming enabled\n`);

  // Handle Ctrl+C gracefully: flush report and exit cleanly
  let isInterrupted = false;
  const handleInterrupt = () => {
    if (isInterrupted) return;
    isInterrupted = true;
    console.log(
      `\n\n⚠️ Process interrupted by user (Ctrl+C). Generating summary report for processed emails...`,
    );
    exportExcelReport(DOWNLOAD_DIR);
    process.exit(0);
  };
  process.on("SIGINT", handleInterrupt);
  process.on("SIGTERM", handleInterrupt);

  for (let offset = 0; offset < candidatesForAi.length; offset += BATCH_SIZE) {
    if (isInterrupted) break;

    const chunkItems = candidatesForAi.slice(offset, offset + BATCH_SIZE);
    const chunkLabel = `[${offset + 1}-${Math.min(offset + BATCH_SIZE, candidatesForAi.length)}/${candidatesForAi.length}]`;

    // 1. Check which items in this batch need Gemini classification
    const uncached = chunkItems.filter((item) => !aiCache.has(item.record.messageId));

    if (uncached.length > 0) {
      console.log(
        `\n── ${chunkLabel} Calling Gemini for ${uncached.length} email(s) (${chunkItems.length - uncached.length} cached) ──`,
      );
      const batchResults = await classifyChunkWithRetry(
        uncached.map((u) => u.email),
        chunkLabel,
        selectedModel,
      );

      for (const res of batchResults) {
        aiCache.set(res.messageId, res);
      }
      // Any uncached item not in batchResults was rejected by Gemini as non-transaction
      for (const u of uncached) {
        if (!aiCache.has(u.record.messageId)) {
          aiCache.set(u.record.messageId, null);
        }
      }
      // Immediately flush AI cache to disk!
      saveAiCache(aiCache);
    } else {
      console.log(
        `\n── ${chunkLabel} All ${chunkItems.length} email(s) loaded from persistent AI cache ──`,
      );
    }

    // 2. Immediately process, persist to DB, and rename disk files for this chunk
    for (const item of chunkItems) {
      const { filename, record, email } = item;
      const aiResult = aiCache.get(record.messageId) || null;

      const lastFour = extractAccountLastFour(`${email.subject}\n${email.body}`);
      const hint = extractAccountNumberHint(`${email.subject}\n${email.body}`);
      const userAccounts = financialAccounts.filter((a) => a.ownerId === record.ownerId);

      // Prefer verified bank from AI or fallback to Registry institution if AI missed the bank name
      const verifiedBank =
        aiResult?.bankName?.trim() ||
        (item.senderInfo?.isBankOrCard && item.senderInfo.institution !== "None"
          ? item.senderInfo.institution
          : null);

      const isKnownMerchant =
        Boolean(verifiedBank) &&
        /^(amazon|flipkart|swiggy|zomato|uber|ola|irctc|bigrock|dineout|bookmyshow|makemytrip|cleartrip|netflix|spotify|google|apple|myntra|ebay|shopclues)/i.test(
          verifiedBank || "",
        );

      let matchedId = matchFinancialAccount(userAccounts, verifiedBank, lastFour, hint);
      let matchedAccount = matchedId ? userAccounts.find((a) => a.id === matchedId) : null;

      // Dynamic Account Provisioning (if live and high confidence)
      // NOTE: Strictly restricted to genuine bank/card/broker institutions - NEVER merchant names!
      if (!isDryRun && !matchedAccount && (aiResult?.confidence ?? 0.95) >= 0.9) {
        if (
          verifiedBank &&
          !isKnownMerchant &&
          verifiedBank !== "Unknown" &&
          verifiedBank !== "None"
        ) {
          const autoName = formatDiscoveredAccountName(verifiedBank, null, lastFour);
          const existingDynamic = userAccounts.find(
            (a) =>
              a.currency === (aiResult?.currency || "INR") &&
              (a.name.toLowerCase() === autoName.toLowerCase() ||
                (lastFour && a.accountNumber?.endsWith(lastFour))),
          );

          if (existingDynamic) {
            matchedAccount = existingDynamic;
            matchedId = existingDynamic.id;
          } else {
            const accountType = inferDiscoveredAccountType(
              verifiedBank,
              aiResult?.description || record.subject,
            );
            try {
              const created = await prisma.wealthAccount.create({
                data: {
                  ownerId: record.ownerId,
                  name: autoName,
                  type: accountType,
                  bankName: verifiedBank,
                  accountNumber: lastFour ? `***${lastFour}` : null,
                  currency: aiResult?.currency || "INR",
                  currentBalance: 0,
                  status: "ACTIVE",
                },
                select: {
                  id: true,
                  ownerId: true,
                  name: true,
                  bankName: true,
                  provider: true,
                  accountNumber: true,
                  currency: true,
                  currentBalance: true,
                },
              });
              financialAccounts.push(created);
              userAccounts.push(created);
              matchedAccount = created;
              matchedId = created.id;
              console.log(`    ✨ Auto-provisioned account: "${created.name}"`);
            } catch (createErr) {
              console.warn(`    ⚠️ Failed to auto-provision account:`, createErr);
            }
          }
        }
      }

      // -------------------------------------------------------------
      // Part A: Process PDF statement attachments (if present)
      // -------------------------------------------------------------
      let importedFromStatement = 0;
      if (record.attachments && record.attachments.length > 0) {
        for (const att of record.attachments) {
          if (!att.filename.toLowerCase().endsWith(".pdf")) continue;
          if (!fs.existsSync(att.localPath)) continue;
          if (!isLikelyStatementPdf(att.filename, record.subject, record.body, item.senderInfo))
            continue;

          console.log(
            `\n  📎 [ATTACHMENT] Found PDF statement: "${att.filename}" in email "${record.subject.slice(0, 50)}"`,
          );
          const pdfBuffer = fs.readFileSync(att.localPath);
          const unlockRes = await unlockPdfAndExtractText(pdfBuffer, record.subject, record.body);

          if (!unlockRes.success) {
            console.warn(`    ❌ [PDF UNLOCK FAILED] ${att.filename}: ${unlockRes.error}`);
            failedPdfStatements.push({
              Date: record.date,
              Provider: record.provider,
              From: record.from,
              Subject: record.subject,
              PdfFilename: att.filename,
              LocalPath: att.localPath,
              Error: unlockRes.error || "Password failed",
              PasswordHintInEmail: extractPasswordHintSnippet(record.subject + "\n" + record.body),
            });
            continue;
          }

          console.log(
            `    🔓 [PDF UNLOCKED] ${att.filename} using ${unlockRes.passwordUsed ? `password: "${unlockRes.passwordUsed}"` : "no password"}`,
          );
          const parsedStmt = parseTextStatement(unlockRes.text);
          console.log(
            `    📄 [STATEMENT PARSED] Extracted ${parsedStmt.transactions.length} transaction(s) from ${att.filename}`,
          );

          if (parsedStmt.transactions.length > 0) {
            const stmtBank = verifiedBank || "Bank";
            for (const sTx of parsedStmt.transactions) {
              const txCurrency = matchedAccount?.currency || "INR";
              const sFingerprint: TransactionFingerprint = {
                amount: sTx.amount,
                currency: txCurrency,
                type: sTx.type,
                date: sTx.date,
                referenceNumber: sTx.referenceNumber,
                description: sTx.description,
                bankName: stmtBank,
              };

              const isDup = runningFingerprints.some((f) =>
                areDuplicateTransactions(sFingerprint, f),
              );
              if (isDup) {
                console.log(
                  `      ⏭️ [STATEMENT DUPLICATE SKIPPED] ${sTx.type} ${sTx.amount} on ${sTx.date.toISOString().slice(0, 10)} matches existing transaction.`,
                );
                continue;
              }

              runningFingerprints.push(sFingerprint);
              importedFromStatement++;

              if (isDryRun) {
                console.log(
                  `      [DRY-RUN STMT TX] ${sTx.type} ${sTx.amount} ${txCurrency} -> ${matchedAccount?.name || "Unmatched"} (${sTx.description.slice(0, 35)})`,
                );
              } else if (matchedAccount) {
                try {
                  await prisma.$transaction([
                    prisma.wealthTransaction.create({
                      data: {
                        accountId: matchedAccount.id,
                        type: sTx.type,
                        amount: sTx.amount,
                        currency: txCurrency,
                        description: sTx.description.slice(0, 240),
                        referenceNumber: sTx.referenceNumber || null,
                        date: sTx.date,
                        balanceAfter: Number(matchedAccount.currentBalance),
                        notes: `Imported from PDF statement ${att.filename}`,
                      },
                    }),
                    prisma.emailTransactionImport.create({
                      data: {
                        ownerId: record.ownerId,
                        emailMessageId:
                          `${record.provider}:${record.messageId}:pdf:${att.id}:${importedFromStatement}`.slice(
                            0,
                            190,
                          ),
                        threadId: record.threadId,
                        fromAddress: record.from,
                        subject: `${record.subject} · ${att.filename}`.slice(0, 500),
                        bankName: stmtBank,
                        description: sTx.description.slice(0, 240),
                        amount: sTx.amount,
                        currency: txCurrency,
                        type: sTx.type,
                        referenceNumber: sTx.referenceNumber || null,
                        date: sTx.date,
                        accountId: matchedAccount.id,
                        status: "IMPORTED",
                        importedAt: new Date(),
                        sourceProvider: record.provider.toUpperCase(),
                        aiConfidence: 1.0,
                        aiReason: `Parsed from verified statement PDF (${att.filename})`,
                        aiClassifiedAt: new Date(),
                      },
                    }),
                  ]);
                  console.log(
                    `      ✓ [STMT IMPORTED] ${sTx.type} ${sTx.amount} ${txCurrency} -> ${matchedAccount.name}`,
                  );
                } catch (saveErr) {
                  console.warn(`      ⚠️ Failed to insert statement transaction:`, saveErr);
                }
              }
            }
          }
        }
      }

      // -------------------------------------------------------------
      // Part B: Process email body alert transaction
      // -------------------------------------------------------------
      if (!aiResult) {
        if (importedFromStatement > 0) {
          autoImportCount += importedFromStatement;
          const newFile = updateFileStatus(filename, "IMPORTED", {
            score: record.score,
            error: `Imported ${importedFromStatement} transaction(s) from attached PDF statement`,
          });
          console.log(
            `  ✓ [IMPORTED VIA STMT] ${importedFromStatement} tx(s) from statement in ${newFile}`,
          );
        } else {
          const newFile = updateFileStatus(filename, "NOT_TRANSACTION", {
            score: record.score,
            aiResult: null,
            error: "Gemini rejected as non-transaction or low confidence",
          });
          notTxCount++;
          console.log(`  [NOT_TRANSACTION] ${record.subject.slice(0, 50)} -> ${newFile}`);
        }
        continue;
      }

      // Check duplicate for the email alert against runningFingerprints
      const alertFingerprint: TransactionFingerprint = {
        amount: aiResult.amount,
        currency: aiResult.currency,
        type: aiResult.type,
        date: aiResult.date,
        referenceNumber: aiResult.referenceNumber,
        description: aiResult.description,
        bankName: verifiedBank,
      };

      const isAlertDuplicate = runningFingerprints.some((f) =>
        areDuplicateTransactions(alertFingerprint, f),
      );
      if (isAlertDuplicate) {
        console.log(
          `  ⏭️ [ALERT DUPLICATE SKIPPED] Email alert ${aiResult.type} ${aiResult.amount} ${aiResult.currency} on ${aiResult.date.toISOString().slice(0, 10)} matches existing transaction.`,
        );
        updateFileStatus(filename, "IMPORTED", {
          score: record.score,
          aiResult: aiResult as unknown as Record<string, unknown>,
          error: "Duplicate of existing transaction (already imported from statement or alert)",
        });
        continue;
      }

      runningFingerprints.push(alertFingerprint);

      const isAutoImport =
        Boolean(matchedAccount) &&
        matchedAccount?.currency === aiResult.currency &&
        aiResult.confidence >= 0.9;

      if (isDryRun) {
        const newFile = updateFileStatus(filename, "CANDIDATE", {
          aiResult: aiResult as unknown as Record<string, unknown>,
        });
        console.log(
          `  [DRY-RUN] ${aiResult.type} ${aiResult.amount} ${aiResult.currency} -> ${matchedAccount?.name || "Unmatched"} -> ${newFile}`,
        );
        continue;
      }

      // Live DB Write
      try {
        if (isAutoImport && matchedAccount) {
          const [wt] = await prisma.$transaction([
            prisma.wealthTransaction.create({
              data: {
                accountId: matchedAccount.id,
                type: aiResult.type,
                amount: aiResult.amount,
                currency: aiResult.currency,
                description: aiResult.description,
                referenceNumber: aiResult.referenceNumber,
                date: aiResult.date,
                balanceAfter: Number(matchedAccount.currentBalance),
                notes: `Imported via local email processor from ${record.provider} alert.`,
              },
            }),
            prisma.emailTransactionImport.upsert({
              where: {
                ownerId_emailMessageId: {
                  ownerId: record.ownerId,
                  emailMessageId: record.messageId,
                },
              },
              create: {
                ownerId: record.ownerId,
                emailMessageId: record.messageId,
                threadId: record.threadId,
                fromAddress: record.from,
                subject: record.subject,
                bankName: aiResult.bankName,
                merchant: aiResult.merchant,
                description: aiResult.description,
                amount: aiResult.amount,
                currency: aiResult.currency,
                type: aiResult.type,
                referenceNumber: aiResult.referenceNumber,
                date: aiResult.date,
                accountId: matchedAccount.id,
                status: "IMPORTED",
                importedAt: new Date(),
                sourceProvider: record.provider.toUpperCase(),
                aiConfidence: aiResult.confidence,
                aiReason: aiResult.reason,
                aiClassifiedAt: new Date(),
              },
              update: {
                status: "IMPORTED",
                importedAt: new Date(),
                accountId: matchedAccount.id,
                aiConfidence: aiResult.confidence,
                aiReason: aiResult.reason,
                aiClassifiedAt: new Date(),
              },
            }),
          ]);

          autoImportCount++;
          const newFile = updateFileStatus(filename, "IMPORTED", {
            aiResult: aiResult as unknown as Record<string, unknown>,
            importedTransactionId: wt.id,
          });
          console.log(
            `  ✓ [IMPORTED] ${aiResult.type} ${aiResult.amount} ${aiResult.currency} -> ${matchedAccount.name} (${newFile})`,
          );
        } else {
          // Queue for review
          await prisma.emailTransactionImport.upsert({
            where: {
              ownerId_emailMessageId: {
                ownerId: record.ownerId,
                emailMessageId: record.messageId,
              },
            },
            create: {
              ownerId: record.ownerId,
              emailMessageId: record.messageId,
              threadId: record.threadId,
              fromAddress: record.from,
              subject: record.subject,
              bankName: aiResult.bankName,
              merchant: aiResult.merchant,
              description: aiResult.description,
              amount: aiResult.amount,
              currency: aiResult.currency,
              type: aiResult.type,
              referenceNumber: aiResult.referenceNumber,
              date: aiResult.date,
              accountId: matchedId,
              status: "PENDING",
              sourceProvider: record.provider.toUpperCase(),
              aiConfidence: aiResult.confidence,
              aiReason: aiResult.reason,
              aiClassifiedAt: new Date(),
            },
            update: {
              status: "PENDING",
              accountId: matchedId,
              aiConfidence: aiResult.confidence,
              aiReason: aiResult.reason,
              aiClassifiedAt: new Date(),
            },
          });

          reviewCount++;
          const newFile = updateFileStatus(filename, "QUEUED_REVIEW", {
            aiResult: aiResult as unknown as Record<string, unknown>,
          });
          console.log(
            `  ⏳ [REVIEW] ${aiResult.type} ${aiResult.amount} ${aiResult.currency} (Unmatched / Low confidence) -> ${newFile}`,
          );
        }
      } catch (saveErr) {
        console.error(`  ❌ Failed to persist transaction for ${filename}:`, saveErr);
        updateFileStatus(filename, "ERROR", {
          error: String(saveErr),
        });
      }
    }
  }

  console.log(`\n============================================================`);
  console.log(`Cycle Results:`);
  console.log(`  • Auto-Imported: ${autoImportCount}`);
  console.log(`  • Queued for Review: ${reviewCount}`);
  console.log(`  • Not Transactions: ${notTxCount}`);
  console.log(`============================================================`);

  if (failedPdfStatements.length > 0) {
    console.log(`\n============================================================`);
    console.log(
      `⚠️ ATTENTION: ${failedPdfStatements.length} PDF statement(s) could not be opened:`,
    );
    console.log(`============================================================`);
    failedPdfStatements.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.Date}] ${f.PdfFilename} (From: ${f.From})`);
      console.log(`     Subject: ${f.Subject}`);
      console.log(`     Hint: ${f.PasswordHintInEmail}`);
      console.log(`     File: ${f.LocalPath}`);
    });

    const failedSheet = XLSX.utils.json_to_sheet(failedPdfStatements);
    const failedWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(failedWb, failedSheet, "Failed Statements");
    const failedXlsx = path.join(DOWNLOAD_DIR, "_failed_pdf_statements.xlsx");
    const failedCsv = path.join(DOWNLOAD_DIR, "_failed_pdf_statements.csv");
    XLSX.writeFile(failedWb, failedXlsx);
    fs.writeFileSync(failedCsv, XLSX.utils.sheet_to_csv(failedSheet), "utf-8");
    console.log(`\n📊 Saved failed statements report:`);
    console.log(`   Excel: ${failedXlsx}`);
    console.log(`   CSV:   ${failedCsv}`);
    console.log(`============================================================\n`);
  }

  exportExcelReport(DOWNLOAD_DIR);
}

main()
  .catch((err) => {
    console.error("Processing failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

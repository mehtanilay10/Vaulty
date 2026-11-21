import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { Type } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/gemini";

const DOWNLOAD_DIR = process.env.LOCAL_EMAILS_DIR || "D:\\TempHub\\Emails";

interface SenderInfo {
  sender: string;
  count: number;
  sampleSubjects: string[];
}

export interface BankSenderClassification {
  sender: string;
  isBankOrCard: boolean;
  institution: string;
  category: "BANK" | "CREDIT_CARD" | "BROKER" | "WALLET" | "MERCHANT" | "OTHER";
  reason: string;
  count?: number;
  sampleSubject?: string;
}

import { getRandomGeminiClient } from "../src/lib/gemini";

function getGeminiClient() {
  return getRandomGeminiClient();
}

const SYSTEM_PROMPT = `You are a financial email classifier expert.
Given a list of email sender addresses and sample email subjects from a user's inbox, determine whether each sender is an official BANK, CREDIT CARD ISSUER, INVESTMENT BROKER, or FINANCIAL INSTITUTION vs. a 3rd-party commercial MERCHANT, VENDOR, SERVICE PROVIDER, or MARKETING SENDER.

CRITICAL RULES:
1. isBankOrCard=TRUE ONLY for:
   - Banks (e.g. HDFC Bank, SBI, ICICI Bank, Axis Bank, Kotak, Citibank, PNB, Bank of Baroda, Equitas, Chase, Wells Fargo, etc.)
   - Credit card issuers (e.g. Amex, SBI Card, OneCard, etc.)
   - Investment brokers and depositories (e.g. Zerodha, Upstox, Groww, AngelOne, CAMS, KFintech, CDSL, NSDL)
   - Official payment networks/banks (e.g. Paytm Payments Bank)

2. isBankOrCard=FALSE for:
   - Merchants and shopping platforms (Amazon, Flipkart, Myntra, eBay, ShopClues)
   - Travel, ticketing, and booking apps (IRCTC, MakeMyTrip, Goibibo, Cleartrip, BookMyShow, Air India, IndiGo)
   - Web hosting, domains, tech providers (BigRock, GoDaddy, Hostinger, Vercel, GitHub, DigitalOcean)
   - Dining and food delivery (Dineout, Swiggy, Zomato, Domino's, Starbucks)
   - Cab/ride hailing (Uber, Ola)
   - Subscriptions and entertainment (Netflix, Spotify, Google Play, OpenAI, Apple)
   - Job boards, social, and alerts (Glassdoor, LinkedIn, Facebook, Google security alerts)
   - Personal contacts or forwarding services

For every sender, return:
- sender: the exact sender email
- isBankOrCard: boolean
- institution: clean name of the bank/financial institution (e.g. "HDFC Bank", "State Bank of India", "Upstox"). If isBankOrCard is false, set institution to "None".
- category: "BANK" | "CREDIT_CARD" | "BROKER" | "WALLET" | "MERCHANT" | "OTHER"
- reason: brief 1-sentence explanation why it is or is not a bank.`;

async function classifySendersBatch(batch: SenderInfo[]): Promise<BankSenderClassification[]> {
  const { ai, apiKey } = getGeminiClient();
  if (!apiKey) throw new Error("No Gemini API key (GEMINI_API_KEY_1..3) configured.");

  const payload = batch.map((item) => ({
    sender: item.sender,
    sampleSubject: item.sampleSubjects[0] || "",
    otherSubjects: item.sampleSubjects.slice(1, 3),
  }));

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Analyze and classify these email senders into banks vs merchants:\n\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sender: { type: Type.STRING },
            isBankOrCard: { type: Type.BOOLEAN },
            institution: { type: Type.STRING },
            category: {
              type: Type.STRING,
              enum: ["BANK", "CREDIT_CARD", "BROKER", "WALLET", "MERCHANT", "OTHER"],
            },
            reason: { type: Type.STRING },
          },
          required: ["sender", "isBankOrCard", "institution", "category", "reason"],
        },
      },
    },
  });

  const text = response.text?.trim() || "[]";
  return JSON.parse(text) as BankSenderClassification[];
}

async function main() {
  console.log(`============================================================`);
  console.log(`Bank Sender Identifier & Registry Generator`);
  console.log(`Scanning emails in: ${DOWNLOAD_DIR}`);
  console.log(`============================================================\n`);

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    console.error(`Directory ${DOWNLOAD_DIR} does not exist.`);
    return;
  }

  const allFiles = fs
    .readdirSync(DOWNLOAD_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  console.log(`Found ${allFiles.length} email file(s) on disk.`);

  // Extract distinct senders with count and sample subjects
  const sendersMap = new Map<string, { count: number; subjects: string[] }>();
  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(path.join(DOWNLOAD_DIR, file), "utf-8");
      const record = JSON.parse(content);
      const sender = (record.from || "").trim().toLowerCase();
      if (!sender || sender === "unknown") continue;

      const existing = sendersMap.get(sender) || { count: 0, subjects: [] };
      existing.count++;
      if (
        record.subject &&
        existing.subjects.length < 5 &&
        !existing.subjects.includes(record.subject)
      ) {
        existing.subjects.push(record.subject);
      }
      sendersMap.set(sender, existing);
    } catch {
      // ignore corrupt
    }
  }

  const distinctSenders: SenderInfo[] = [...sendersMap.entries()]
    .map(([sender, data]) => ({
      sender,
      count: data.count,
      sampleSubjects: data.subjects,
    }))
    .sort((a, b) => b.count - a.count);

  console.log(`Found ${distinctSenders.length} distinct sender address(es) across all emails.\n`);

  // Classify in batches of 20
  const classifiedResults: BankSenderClassification[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < distinctSenders.length; i += BATCH_SIZE) {
    const chunk = distinctSenders.slice(i, i + BATCH_SIZE);
    const chunkRange = `${i + 1}-${Math.min(i + BATCH_SIZE, distinctSenders.length)}`;
    console.log(`Classifying senders [${chunkRange}/${distinctSenders.length}] with Gemini...`);

    let attempts = 0;
    while (attempts < 3) {
      try {
        const results = await classifySendersBatch(chunk);
        for (const r of results) {
          const info = sendersMap.get(r.sender.toLowerCase());
          classifiedResults.push({
            ...r,
            count: info?.count || 0,
            sampleSubject: info?.subjects[0] || "",
          });
        }
        break;
      } catch (err) {
        attempts++;
        console.warn(`  Attempt ${attempts}/3 failed:`, err);
        if (attempts >= 3) {
          console.error(`  Skipping batch ${chunkRange} due to repeated error.`);
        } else {
          await new Promise((r) => setTimeout(r, 2000 * attempts));
        }
      }
    }
  }

  console.log(`\n============================================================`);
  console.log(`Classification complete. Total senders classified: ${classifiedResults.length}`);

  const bankSenders = classifiedResults.filter((r) => r.isBankOrCard);
  const merchantSenders = classifiedResults.filter((r) => !r.isBankOrCard);

  console.log(`  • Verified Bank / Financial Senders: ${bankSenders.length}`);
  console.log(`  • Merchants / Non-Bank Senders:     ${merchantSenders.length}`);
  console.log(`============================================================\n`);

  console.log(`Top Bank / Financial Senders Identified:`);
  for (const b of bankSenders.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 25)) {
    console.log(
      `  ✓ [${b.category}] ${b.institution} (${b.sender}) -> ${b.count} email(s) | Sample: "${b.sampleSubject?.slice(0, 45)}"`,
    );
  }

  // Save to JSON registry
  const jsonPath = path.join(DOWNLOAD_DIR, "_bank_senders.json");
  fs.writeFileSync(jsonPath, JSON.stringify(classifiedResults, null, 2), "utf-8");
  console.log(`\nSaved JSON registry: ${jsonPath}`);

  // Save to Excel workbook for user review/customization
  const excelPath = path.join(DOWNLOAD_DIR, "_bank_senders.xlsx");
  const excelRows = classifiedResults
    .sort(
      (a, b) =>
        (b.isBankOrCard ? 1 : 0) - (a.isBankOrCard ? 1 : 0) || (b.count || 0) - (a.count || 0),
    )
    .map((r) => ({
      "Sender Email": r.sender,
      "Is Bank or Card?": r.isBankOrCard ? "YES" : "NO",
      "Institution Name": r.institution,
      Category: r.category,
      "Email Count": r.count || 0,
      "Sample Subject": r.sampleSubject || "",
      Reason: r.reason,
    }));

  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Bank Senders Registry");
  XLSX.writeFile(workbook, excelPath);
  console.log(`Saved Excel registry: ${excelPath}`);

  console.log(
    `\nYou can now run 'yarn emails:process' which will strictly filter on verified bank senders!`,
  );
}

main().catch((err) => {
  console.error("Sender identification failed:", err);
  process.exit(1);
});

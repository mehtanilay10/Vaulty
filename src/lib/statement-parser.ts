import { Type } from "@google/genai";
import {
  getRandomGeminiClient,
  GEMINI_MODEL,
  GEMINI_FALLBACK_MODEL,
  isGeminiQuotaError,
  markGeminiKeyCooldown,
} from "@/lib/gemini";

/**
 * Bank statement parser for importing transactions
 * Supports CSV and basic PDF text extraction
 */

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  type: "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT";
  referenceNumber?: string;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  errors: string[];
  summary: {
    totalDeposits: number;
    totalWithdrawals: number;
    netChange: number;
  };
}

/**
 * Normalizes 2-digit or 4-digit year strings to a 4-digit number.
 * Assumption: Two-digit years in financial statements use a rolling pivot window:
 * values <= (currentYear % 100 + 20) are treated as 20xx (current century),
 * while values > (currentYear % 100 + 20) are mapped to 19xx (previous century, e.g. 1970-1999).
 * Dates are strictly constructed in UTC midnight to avoid locale-dependent timezone variations.
 */
function normalizeYear(yearStr: string): number {
  if (yearStr.length === 2) {
    const yy = Number(yearStr);
    if (!Number.isNaN(yy)) {
      const currentYear = new Date().getUTCFullYear();
      const currentCentury = Math.floor(currentYear / 100) * 100;
      const pivot = (currentYear % 100) + 20;
      return yy <= pivot ? currentCentury + yy : currentCentury - 100 + yy;
    }
  }
  return Number(yearStr);
}

function parseStatementDate(value: string): Date | null {
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    return !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month &&
      date.getUTCDate() === day
      ? date
      : null;
  }
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(input);
  if (dayFirst) {
    const year = normalizeYear(dayFirst[3]);
    const month = Number(dayFirst[2]) - 1;
    const day = Number(dayFirst[1]);
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    if (
      !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month &&
      date.getUTCDate() === day
    ) {
      return date;
    }
    return null;
  }
  const named = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/.exec(input);
  if (named) {
    const year = normalizeYear(named[3]);
    const day = Number(named[1]);
    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const monthIndex = monthNames.indexOf(named[2].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) {
      const date = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
      if (
        !Number.isNaN(date.getTime()) &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === monthIndex &&
        date.getUTCDate() === day
      ) {
        return date;
      }
    }
    return null;
  }
  return null;
}

/**
 * RFC 4180 compliant CSV line tokenizer supporting quoted fields, commas, escaped quotes, and newlines.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (i + 1 < text.length && text[i + 1] === "\n") {
          i++;
        }
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.some((field) => field.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        if (currentRow.some((field) => field.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((field) => field.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parse CSV bank statement
 */
export function parseCSVStatement(csvContent: string): ParseResult {
  const rows = parseCsvRows(csvContent);
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  if (rows.length <= 1) {
    return {
      transactions: [],
      errors: rows.length === 0 ? ["CSV content is empty."] : [],
      summary: { totalDeposits: 0, totalWithdrawals: 0, netChange: 0 },
    };
  }

  // Detect column mapping from header row
  const headerRow = rows[0].map((h) => h.trim().toLowerCase());

  let dateIdx = -1;
  let descIdx = -1;
  let amountIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  let refIdx = -1;
  let typeIdx = -1;

  headerRow.forEach((col, idx) => {
    if (dateIdx === -1 && /\b(date|txn\s*date|trans(action)?\s*date|value\s*date)\b/i.test(col)) {
      dateIdx = idx;
    } else if (debitIdx === -1 && /\b(debit|dr|withdrawal|spent|paid\s*out)\b/i.test(col)) {
      debitIdx = idx;
    } else if (creditIdx === -1 && /\b(credit|cr|deposit|received|paid\s*in)\b/i.test(col)) {
      creditIdx = idx;
    } else if (amountIdx === -1 && /\b(amount|net\s*amount)\b/i.test(col)) {
      amountIdx = idx;
    } else if (
      descIdx === -1 &&
      /\b(desc(ription)?|narration|particulars|details|memo|payee|merchant)\b/i.test(col)
    ) {
      descIdx = idx;
    } else if (
      refIdx === -1 &&
      /\b(ref(erence)?|chq|cheque|utr|txn\s*id|transaction\s*id)\b/i.test(col)
    ) {
      refIdx = idx;
    } else if (typeIdx === -1 && /\b(type|dr\s*\/?\s*cr|d\/c)\b/i.test(col)) {
      typeIdx = idx;
    }
  });

  const hasRecognizedHeaders =
    dateIdx !== -1 || descIdx !== -1 || amountIdx !== -1 || debitIdx !== -1 || creditIdx !== -1;

  if (!hasRecognizedHeaders) {
    dateIdx = 0;
    descIdx = 1;
    amountIdx = 2;
    refIdx = 3;
  } else {
    if (dateIdx === -1) dateIdx = 0;
    if (descIdx === -1) descIdx = dateIdx === 0 ? 1 : 0;
  }

  const dataRows = rows.slice(1);

  const parseAmountVal = (str?: string) => {
    if (!str) return NaN;
    return parseFloat(str.replace(/[₹,$€£\s]|Rs\.?|INR/gi, ""));
  };

  for (const columns of dataRows) {
    const rawLine = columns.join(",");
    try {
      if (columns.length <= Math.max(dateIdx, descIdx)) {
        continue;
      }

      const dateStr = columns[dateIdx]?.trim();
      if (!dateStr) continue;

      const date = parseStatementDate(dateStr);
      if (!date) {
        errors.push(`Invalid date: ${dateStr}`);
        continue;
      }

      const description = (columns[descIdx]?.trim() || "Transaction").slice(0, 200);
      const referenceNumber = refIdx !== -1 ? columns[refIdx]?.trim() || undefined : undefined;

      let amount = 0;
      let type: "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "TRANSFER_IN" | "TRANSFER_OUT" = "DEPOSIT";

      if (debitIdx !== -1 || creditIdx !== -1) {
        const debitVal = debitIdx !== -1 ? parseAmountVal(columns[debitIdx]) : NaN;
        const creditVal = creditIdx !== -1 ? parseAmountVal(columns[creditIdx]) : NaN;

        if (!Number.isNaN(debitVal) && Math.abs(debitVal) > 0) {
          amount = Math.abs(debitVal);
          type = "WITHDRAWAL";
        } else if (!Number.isNaN(creditVal) && Math.abs(creditVal) > 0) {
          amount = Math.abs(creditVal);
          type = "DEPOSIT";
        } else if (amountIdx !== -1) {
          const amtVal = parseAmountVal(columns[amountIdx]);
          if (!Number.isNaN(amtVal)) {
            amount = Math.abs(amtVal);
            type = amtVal >= 0 ? "DEPOSIT" : "WITHDRAWAL";
          } else {
            continue;
          }
        } else {
          continue;
        }
      } else if (amountIdx !== -1) {
        const rawAmt = columns[amountIdx]?.trim();
        const parsedAmt = parseAmountVal(rawAmt);
        if (Number.isNaN(parsedAmt)) {
          errors.push(`Invalid amount: ${rawAmt}`);
          continue;
        }
        amount = Math.abs(parsedAmt);

        if (typeIdx !== -1) {
          const typeIndicator = columns[typeIdx]?.trim().toUpperCase();
          if (/^(DR|DEBIT|W)/.test(typeIndicator)) {
            type = "WITHDRAWAL";
          } else if (/^(CR|CREDIT|D)/.test(typeIndicator)) {
            type = "DEPOSIT";
          } else {
            type = parsedAmt >= 0 ? "DEPOSIT" : "WITHDRAWAL";
          }
        } else {
          type = parsedAmt >= 0 ? "DEPOSIT" : "WITHDRAWAL";
        }
      } else {
        errors.push(`Could not determine amount column for row: ${rawLine}`);
        continue;
      }

      transactions.push({
        date,
        description,
        amount,
        type,
        referenceNumber,
      });
    } catch {
      errors.push(`Error parsing row: ${rawLine}`);
    }
  }

  const totalDeposits = transactions
    .filter((t) => t.type === "DEPOSIT" || t.type === "TRANSFER_IN")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => t.type === "WITHDRAWAL" || t.type === "PAYMENT" || t.type === "TRANSFER_OUT")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    transactions,
    errors,
    summary: {
      totalDeposits,
      totalWithdrawals,
      netChange: totalDeposits - totalWithdrawals,
    },
  };
}

/**
 * Parse basic text statement (from PDF extraction)
 * This is a simplified parser for common formats
 */
export function parseTextStatement(textContent: string): ParseResult {
  const lines = textContent.split("\n").filter((line) => line.trim());
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Try to detect transaction lines by looking for dates and amounts
  const dateAmountPattern =
    /(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}).*?([-+]?\s*(?:₹|Rs\.?|INR|\$|€|£)?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi;

  for (const line of lines) {
    const matches = [...line.matchAll(dateAmountPattern)];

    for (const match of matches) {
      try {
        const dateStr = match[1];
        const amountStr = match[2].replace(/₹|Rs\.?|INR|[$,€£\s]/gi, "");

        const date = parseStatementDate(dateStr);
        if (!date) {
          continue;
        }

        const amount = parseFloat(amountStr);
        if (isNaN(amount)) {
          continue;
        }

        // Extract description (everything between date and amount)
        const amountOffset = match[0].lastIndexOf(match[2]);
        const description = line
          .substring(match.index + dateStr.length, match.index + amountOffset)
          .trim()
          .replace(/^[:\s-]+|[:\s-]+$/g, "")
          .substring(0, 200); // Limit description length

        const lineDirection = line.toUpperCase();
        const debitHint =
          /\b(DR|DEBIT|DEBITED|WITHDRAWAL|PURCHASE|ATM WITHDRAWAL|UPI|POS|CARD PURCHASE|BILLPAY)\b/.test(
            lineDirection,
          );
        const creditHint = /\b(CR|CREDIT|CREDITED|DEPOSIT|REFUND|INTEREST|DIVIDEND)\b/.test(
          lineDirection,
        );
        const type = amount < 0 || (debitHint && !creditHint) ? "WITHDRAWAL" : "DEPOSIT";

        transactions.push({
          date,
          description: description || "Unknown transaction",
          amount: Math.abs(amount),
          type,
        });
      } catch {
        errors.push(`Error parsing transaction: ${line}`);
      }
    }
  }

  const totalDeposits = transactions
    .filter((t) => t.type === "DEPOSIT")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => t.type === "WITHDRAWAL")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    transactions,
    errors,
    summary: {
      totalDeposits,
      totalWithdrawals,
      netChange: totalDeposits - totalWithdrawals,
    },
  };
}

/**
 * AI-powered statement parser using Gemini structured outputs.
 * Parses complex, multi-column, or non-standard bank statement layouts.
 */
export async function parseStatementWithGemini(textContent: string): Promise<ParseResult> {
  const client = getRandomGeminiClient();
  const prompt = `You are a precise financial statement parser. Extract all individual transaction records from the following bank or credit card statement text.

Statement Text:
"""
${textContent.slice(0, 50000)}
"""

Instructions:
1. Parse every transaction row into:
   - date: ISO date string "YYYY-MM-DD". Infer correct year, month, and day.
   - description: merchant or narrative description (cleaned of excessive whitespace).
   - amount: strictly positive number (e.g. 1250.50).
   - type: "DEPOSIT" (incoming, credits, refunds) or "WITHDRAWAL" (outgoing, debits, purchases, fees, payments).
   - referenceNumber: optional check, UTR, or reference number if present.
2. Exclude summary lines, headers, starting balances, or ending balances.
`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      transactions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
            description: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            type: {
              type: Type.STRING,
              enum: [
                "DEPOSIT",
                "WITHDRAWAL",
                "PAYMENT",
                "TRANSFER_IN",
                "TRANSFER_OUT",
                "ADJUSTMENT",
              ],
            },
            referenceNumber: { type: Type.STRING },
          },
          required: ["date", "description", "amount", "type"],
        },
      },
    },
    required: ["transactions"],
  };

  let rawJson: string | null = null;
  // Try primary model
  try {
    const response = await client.ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        abortSignal: AbortSignal.timeout(30_000),
      },
    });
    rawJson = response.text || null;
  } catch (err) {
    if (isGeminiQuotaError(err)) {
      markGeminiKeyCooldown(client.apiKey);
    }
    console.warn(`[Statement Parser AI] Primary model (${GEMINI_MODEL}) failed:`, err);
  }

  // Fallback model with alternate key if primary failed
  if (!rawJson && GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
    try {
      const fallbackClient = getRandomGeminiClient(client.apiKey);
      const response = await fallbackClient.ai.models.generateContent({
        model: GEMINI_FALLBACK_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          abortSignal: AbortSignal.timeout(30_000),
        },
      });
      rawJson = response.text || null;
    } catch (fallbackErr) {
      if (isGeminiQuotaError(fallbackErr)) {
        markGeminiKeyCooldown(client.apiKey);
      }
      console.error(
        `[Statement Parser AI] Fallback model (${GEMINI_FALLBACK_MODEL}) also failed:`,
        fallbackErr,
      );
    }
  }

  if (!rawJson) {
    return {
      transactions: [],
      errors: ["AI statement extraction failed or returned empty response."],
      summary: { totalDeposits: 0, totalWithdrawals: 0, netChange: 0 },
    };
  }

  try {
    const parsed = JSON.parse(rawJson) as {
      transactions?: Array<{
        date: string;
        description: string;
        amount: number;
        type: "DEPOSIT" | "WITHDRAWAL" | "PAYMENT" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT";
        referenceNumber?: string;
      }>;
    };

    const transactions: ParsedTransaction[] = [];
    const errors: string[] = [];

    for (const item of parsed.transactions || []) {
      const d = new Date(item.date);
      if (isNaN(d.getTime())) {
        errors.push(`Invalid date format from AI: ${item.date}`);
        continue;
      }
      transactions.push({
        date: d,
        description: item.description?.trim() || "Transaction",
        amount: Math.abs(Number(item.amount) || 0),
        type: item.type || "WITHDRAWAL",
        referenceNumber: item.referenceNumber?.trim() || undefined,
      });
    }

    const totalDeposits = transactions
      .filter((t) => t.type === "DEPOSIT" || t.type === "TRANSFER_IN")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = transactions
      .filter((t) => t.type !== "DEPOSIT" && t.type !== "TRANSFER_IN")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      transactions,
      errors,
      summary: {
        totalDeposits,
        totalWithdrawals,
        netChange: totalDeposits - totalWithdrawals,
      },
    };
  } catch (parseErr) {
    return {
      transactions: [],
      errors: [
        `Failed to parse structured JSON from AI: ${parseErr instanceof Error ? parseErr.message : "Unknown error"}`,
      ],
      summary: { totalDeposits: 0, totalWithdrawals: 0, netChange: 0 },
    };
  }
}

/**
 * Two-pass statement parser:
 * 1. Fast Regex Pass: Instant heuristic parser for standard layouts.
 * 2. AI Fallback Pass: If regex yields 0 transactions or encounters complex non-standard layouts,
 *    invokes Gemini with structured schema output to accurately parse statements.
 */
export async function parseTextStatementWithAiFallback(textContent: string): Promise<ParseResult> {
  const heuristicResult = parseTextStatement(textContent);
  if (heuristicResult.transactions.length > 0 || textContent.trim().length < 50) {
    return heuristicResult;
  }

  try {
    const aiResult = await parseStatementWithGemini(textContent);
    if (aiResult.transactions.length > 0) {
      return aiResult;
    }
  } catch (err) {
    console.warn("[Statement Parser] AI fallback failed, returning heuristic result:", err);
  }

  return heuristicResult;
}

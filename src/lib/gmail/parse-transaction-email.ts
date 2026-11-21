export interface ParsedEmailTransaction {
  amount: number;
  currency: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "REFUND";
  description: string;
  merchant: string | null;
  referenceNumber: string | null;
  bankName: string | null;
  date: Date;
}

function normalizeText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectCurrency(text: string) {
  const marker =
    text.match(
      /(?:\bINR\b|\bRs\.?|₹|\bUSD\b|\$|\bEUR\b|€|\bGBP\b|£|\bAED\b)\s*[:.-]?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?/i,
    )?.[0] || "INR";
  if (/\bUSD\b|\$/i.test(marker)) return "USD";
  if (/\bEUR\b|€/i.test(marker)) return "EUR";
  if (/\bGBP\b|£/i.test(marker)) return "GBP";
  if (/\bAED\b/i.test(marker)) return "AED";
  return "INR";
}

function detectType(text: string): ParsedEmailTransaction["type"] | null {
  const refundIndex = text.search(/\b(refund(?:ed)?|reversal|cashback credited)\b/i);
  const debitIndex = text.search(
    /\b(debited|withdrawn|spent|purchase|paid|payment sent|sent to|charged|deducted)\b/i,
  );
  const creditIndex = text.search(
    /\b(credited|received|deposited|salary credited|money received)\b/i,
  );
  const options = [
    { index: refundIndex, type: "REFUND" as const },
    { index: debitIndex, type: "WITHDRAWAL" as const },
    { index: creditIndex, type: "DEPOSIT" as const },
  ]
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  return options[0]?.type || null;
}

function detectAmount(text: string) {
  const currencyAmount =
    /(?:INR|Rs\.?|₹|USD|EUR|GBP|AED|\$|€|£)\s*[:.-]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i;
  const match = text.match(currencyAmount);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 && amount <= 100_000_000 ? amount : null;
}

function detectMerchant(text: string) {
  const match = text.match(/\b(?:to|at|towards|merchant)\s+([A-Z0-9][A-Z0-9 .&'_-]{1,48})/i);
  if (!match?.[1]) return null;
  const value = match[1]
    .split(/\b(?:on|for|via|using|from|ref|utr|transaction|available balance)\b/i)[0]
    .trim()
    .replace(/[.;,:|]+$/g, "")
    .trim();
  if (!value || value.length < 2) return null;
  // Avoid treating generic account/card wording as a merchant for salary or refund alerts.
  if (/^(?:(?:your|the)\s+)?(?:account|card|bank account)\b/i.test(value)) return null;
  return value.slice(0, 60);
}

function detectReference(text: string) {
  const match = text.match(
    /\b(?:UTR|UPI\s*(?:Ref(?:erence)?(?:\s*No\.?)?|ID)|Txn\s*ID|Transaction\s*ID|RRN|Ref(?:erence)?\s*(?:No\.?|Number)?)\s*[:#-]?\s*([A-Z0-9-]{8,24})\b/i,
  );
  return match?.[1] ? match[1].slice(0, 40) : null;
}

function detectBankName(text: string) {
  const banks = [
    "HDFC Bank",
    "ICICI Bank",
    "State Bank of India",
    "SBI",
    "Axis Bank",
    "Kotak Mahindra Bank",
    "IDFC FIRST Bank",
    "Federal Bank",
    "Bank of Baroda",
    "Punjab National Bank",
    "Canara Bank",
    "Union Bank",
    "AU Small Finance Bank",
    "IndusInd Bank",
    "Yes Bank",
    "HSBC",
    "American Express",
  ];
  const found = banks.find((bank) =>
    new RegExp(bank.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text),
  );
  if (!found) return null;
  if (found === "SBI") return "State Bank of India";
  return found;
}

export function parseTransactionEmail(input: {
  subject: string;
  from: string;
  body: string;
  receivedAt: Date;
}): ParsedEmailTransaction | null {
  const text = normalizeText(`${input.subject}\n${input.body}`).slice(0, 30_000);
  const type = detectType(text);
  const amount = detectAmount(text);
  if (!type || !amount) return null;

  const merchant = detectMerchant(text);
  const bankName = detectBankName(`${input.from} ${input.subject} ${text.slice(0, 2_000)}`);
  const prefix =
    type === "WITHDRAWAL" ? "Payment" : type === "REFUND" ? "Refund" : "Money received";
  const description = merchant
    ? `${prefix} — ${merchant}`
    : `${prefix}${bankName ? ` — ${bankName}` : " — bank transaction"}`;

  return {
    amount,
    currency: detectCurrency(text),
    type,
    description: description.slice(0, 180),
    merchant,
    referenceNumber: detectReference(text),
    bankName,
    date: input.receivedAt,
  };
}

export function decodeGmailBody(data?: string | null) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function extractGmailMessageText(
  payload:
    | {
        mimeType?: string | null;
        body?: { data?: string | null } | null;
        parts?: Array<{
          mimeType?: string | null;
          body?: { data?: string | null } | null;
          parts?: unknown[] | null;
        }> | null;
      }
    | null
    | undefined,
): string {
  if (!payload) return "";
  const chunks: string[] = [];
  const visit = (part: typeof payload) => {
    if (!part) return;
    if (part.mimeType === "text/plain" && part.body?.data) {
      chunks.push(decodeGmailBody(part.body.data));
    } else if (part.mimeType === "text/html" && part.body?.data && chunks.length === 0) {
      chunks.push(decodeGmailBody(part.body.data));
    }
    for (const child of (part.parts || []) as (typeof payload)[]) visit(child);
  };
  visit(payload);
  return normalizeText(chunks.join("\n"));
}

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FALLBACK_MODEL,
  GEMINI_MODEL as CONFIG_GEMINI_MODEL,
  GEMINI_FALLBACK_MODEL as CONFIG_GEMINI_FALLBACK_MODEL,
} from "@/lib/constants";

export const GEMINI_MODEL = CONFIG_GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
export const GEMINI_FALLBACK_MODEL = CONFIG_GEMINI_FALLBACK_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL;

/**
 * 30-second cooldown period for keys that encounter 429 / RESOURCE_EXHAUSTED.
 */
export const GEMINI_COOLDOWN_MS = 30_000;

// In-memory registry of apiKey -> cooldown expiry timestamp
const keyCooldowns = new Map<string, number>();

/**
 * Mark a Gemini API key as cooling down for a given duration (default: 30 seconds).
 */
export function markGeminiKeyCooldown(apiKey: string, cooldownMs = GEMINI_COOLDOWN_MS): void {
  if (!apiKey) return;
  const expiresAt = Date.now() + cooldownMs;
  keyCooldowns.set(apiKey, expiresAt);
  console.warn(
    `[Gemini] Key ending in ...${apiKey.slice(-4)} placed in cooldown for ${cooldownMs / 1000}s until ${new Date(expiresAt).toISOString()}`,
  );
}

/**
 * Check if a Gemini API key is currently in cooldown.
 */
export function isGeminiKeyCoolingDown(apiKey: string): boolean {
  if (!apiKey) return false;
  const expiresAt = keyCooldowns.get(apiKey);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    keyCooldowns.delete(apiKey);
    return false;
  }
  return true;
}

/**
 * Clear all key cooldowns (useful for tests or manual reset).
 */
export function clearGeminiKeyCooldowns(): void {
  keyCooldowns.clear();
}

/**
 * Check whether an error is a Gemini rate-limit or quota-exhaustion error (HTTP 429).
 */
export function isGeminiQuotaError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;
  return (
    status === 429 || /429|RESOURCE_EXHAUSTED|quota|rate limit|too many requests/i.test(message)
  );
}

/**
 * Check whether an error is retryable or transient (HTTP 429, 503, 500, UNAVAILABLE, timeout).
 */
export function isGeminiRetryableError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;
  return (
    status === 429 ||
    status === 503 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    /429|503|500|502|504|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|overloaded|spikes in demand|quota|rate limit|too many requests|timed out|timeout/i.test(
      message,
    )
  );
}

/**
 * Collect configured Gemini API keys from environment variables.
 * Uses GEMINI_API_KEY_1, GEMINI_API_KEY_2, and GEMINI_API_KEY_3.
 */
export function getGeminiApiKeys(): string[] {
  const keys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k && k.length > 0));

  return Array.from(new Set(keys));
}

/**
 * Validate Gemini environment configuration at startup
 */
function validateGeminiConfig(): void {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "At least one Gemini API key (GEMINI_API_KEY_1, GEMINI_API_KEY_2, or GEMINI_API_KEY_3) is required in production.",
      );
    } else {
      console.warn("[Gemini] No Gemini API key (GEMINI_API_KEY_1..3) configured.");
    }
  }
}
validateGeminiConfig();

/**
 * Returns a GoogleGenAI instance with an active (non-cooldown) API key from the configured pool.
 * If an excludedKey is supplied, it attempts to pick a different key.
 * If all keys are in cooldown, it picks the key with the soonest expiring cooldown.
 */
export function getRandomGeminiClient(excludedKey?: string): { ai: GoogleGenAI; apiKey: string } {
  const allKeys = getGeminiApiKeys();
  if (allKeys.length === 0) {
    return { ai: new GoogleGenAI({ apiKey: "" }), apiKey: "" };
  }

  // 1. Exclude the explicitly requested key (e.g. key that just failed)
  const candidatePool =
    excludedKey && allKeys.length > 1 ? allKeys.filter((k) => k !== excludedKey) : allKeys;

  // 2. Filter for keys not in cooldown
  const readyKeys = candidatePool.filter((k) => !isGeminiKeyCoolingDown(k));

  let selectedKey: string;
  if (readyKeys.length > 0) {
    selectedKey = readyKeys[Math.floor(Math.random() * readyKeys.length)];
  } else {
    // All candidates are cooling down: pick the one whose cooldown expires soonest
    const sortedByExpiry = [...candidatePool].sort((a, b) => {
      const expA = keyCooldowns.get(a) || 0;
      const expB = keyCooldowns.get(b) || 0;
      return expA - expB;
    });
    selectedKey = sortedByExpiry[0];
    console.warn(
      `[Gemini] All keys are cooling down. Re-using key ending in ...${selectedKey.slice(-4)} with earliest expiry.`,
    );
  }

  return {
    ai: new GoogleGenAI({ apiKey: selectedKey }),
    apiKey: selectedKey,
  };
}

export const geminiResponseSchema = z.object({
  extractedText: z.string().optional().default(""),
  summaryMarkdown: z.string().optional().default("## Summary\n\nNo summary available."),
  interpretationMarkdown: z.string().optional().default("No interpretation available."),
  documentMetadata: z
    .object({
      documentType: z.string().nullable().optional().default(null),
      expiryDate: z.string().nullable().optional().default(null),
      expiryDateConfidence: z.coerce.number().optional().default(0),
      expiryDateEvidence: z.string().nullable().optional().default(null),
      importantDates: z
        .array(
          z.object({
            type: z.string(),
            date: z.string(),
            confidence: z.coerce.number().optional().default(0),
            evidence: z.string().nullable().optional().default(null),
          }),
        )
        .optional()
        .default([]),
    })
    .optional()
    .default({
      documentType: null,
      expiryDate: null,
      expiryDateConfidence: 0,
      expiryDateEvidence: null,
      importantDates: [],
    }),
});

export interface GeminiProcessResult {
  extractedText: string;
  summaryMarkdown: string;
  interpretationMarkdown: string;
  documentMetadata: {
    documentType: string | null;
    expiryDate: string | null;
    expiryDateConfidence: number;
    expiryDateEvidence: string | null;
    importantDates: Array<{
      type: string;
      date: string;
      confidence: number;
      evidence: string | null;
    }>;
  };
}

const SYSTEM_PROMPT = `
You are an expert, objective document analyst for Vaulty, a private personal document vault.
Your task is to analyze the provided document (PDF or image) and output a JSON response containing three fields:
1. "extractedText": Complete, verbatim text extracted from the document. Preserve numbers, dates, medical values, names, units, and formatting layout as accurately as possible.
2. "summaryMarkdown": A clear, structured Markdown summary of the document. Use section headings like "## Document Summary", "## Key Details", and bullet points.
3. "interpretationMarkdown": Helpful informational interpretation of what the document indicates or means.
4. "documentMetadata": Structured metadata for reminders. Extract documentType and expiryDate (ISO YYYY-MM-DD) only when explicitly printed. Set expiryDateConfidence from 0 to 1 and quote a short expiryDateEvidence excerpt. Also extract importantDates as an array of explicitly printed deadlines such as insurance premium due dates, policy renewal dates, payment due dates, subscription end dates, and other financial deadlines. Each item must include a concise type, ISO YYYY-MM-DD date, confidence 0..1, and short evidence quote. Never infer dates from issue date, policy duration, age, or assumptions.

CRITICAL RULES AND MANDATES:
- DO NOT invent, fabricate, or hallucinate facts, dates, names, or values.
- IF information is missing or unclear, explicitly state that it is not present in the document.
- FOR MEDICAL DOCUMENTS: Provide informational interpretation ONLY. Do NOT claim to be a doctor or make a diagnosis. Do NOT suggest stopping or altering medications. Include a brief medical disclaimer note.
- Preserve exact numerical values, units, and abnormal findings.
- Format all outputs strictly as JSON adhering to the specified schema.
`;

export async function processDocumentWithGemini(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<GeminiProcessResult> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error("No Gemini API key (GEMINI_API_KEY_1..3) is configured.");
  }

  const base64Data = fileBuffer.toString("base64");
  const requestPayload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `Analyze this document named "${filename}". Provide the extracted text, Markdown summary, and Markdown interpretation strictly in JSON schema format.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extractedText: { type: Type.STRING },
          summaryMarkdown: { type: Type.STRING },
          interpretationMarkdown: { type: Type.STRING },
          documentMetadata: {
            type: Type.OBJECT,
            properties: {
              documentType: { type: Type.STRING, nullable: true },
              expiryDate: { type: Type.STRING, nullable: true },
              expiryDateConfidence: { type: Type.NUMBER },
              expiryDateEvidence: { type: Type.STRING, nullable: true },
              importantDates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    date: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                    evidence: { type: Type.STRING, nullable: true },
                  },
                  required: ["type", "date", "confidence", "evidence"],
                },
              },
            },
            required: [
              "documentType",
              "expiryDate",
              "expiryDateConfidence",
              "expiryDateEvidence",
              "importantDates",
            ],
          },
        },
        required: [
          "extractedText",
          "summaryMarkdown",
          "interpretationMarkdown",
          "documentMetadata",
        ],
      },
    },
  };

  const firstClient = getRandomGeminiClient();
  let responseText: string | undefined;

  try {
    const response = await firstClient.ai.models.generateContent({
      model: GEMINI_MODEL,
      ...requestPayload,
    });
    responseText = response?.text;
  } catch (primaryErr) {
    if (isGeminiQuotaError(primaryErr)) {
      markGeminiKeyCooldown(firstClient.apiKey, GEMINI_COOLDOWN_MS);
    }
    console.warn(
      `[Gemini] Primary model ${GEMINI_MODEL} failed, trying fallback model ${GEMINI_FALLBACK_MODEL}:`,
      primaryErr,
    );
    const fallbackClient = getRandomGeminiClient(firstClient.apiKey);
    try {
      const response = await fallbackClient.ai.models.generateContent({
        model: GEMINI_FALLBACK_MODEL,
        ...requestPayload,
      });
      responseText = response?.text;
    } catch (fallbackErr) {
      if (isGeminiQuotaError(fallbackErr)) {
        markGeminiKeyCooldown(fallbackClient.apiKey, GEMINI_COOLDOWN_MS);
      }
      throw fallbackErr;
    }
  }

  if (!responseText) {
    throw new Error("Empty response received from Gemini API.");
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(responseText);
  } catch (parseErr) {
    throw new Error(
      `Failed to parse Gemini response as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    );
  }

  const validation = geminiResponseSchema.safeParse(rawJson);
  if (!validation.success) {
    throw new Error(`Invalid Gemini response format: ${validation.error.message}`);
  }

  const parsed = validation.data;
  return {
    extractedText: parsed.extractedText || "",
    summaryMarkdown: parsed.summaryMarkdown || "## Summary\n\nNo summary available.",
    interpretationMarkdown: parsed.interpretationMarkdown || "No interpretation available.",
    documentMetadata: {
      documentType: parsed.documentMetadata.documentType || null,
      expiryDate: parsed.documentMetadata.expiryDate || null,
      expiryDateConfidence: Math.max(
        0,
        Math.min(1, Number(parsed.documentMetadata.expiryDateConfidence) || 0),
      ),
      expiryDateEvidence: parsed.documentMetadata.expiryDateEvidence || null,
      importantDates: Array.isArray(parsed.documentMetadata.importantDates)
        ? parsed.documentMetadata.importantDates
            .filter(
              (item) => item && typeof item.type === "string" && typeof item.date === "string",
            )
            .map((item) => ({
              type: (item.type || "").length > 80 ? item.type.slice(0, 80) : item.type,
              date: item.date,
              confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
              evidence:
                typeof item.evidence === "string"
                  ? item.evidence.length > 500
                    ? item.evidence.slice(0, 500)
                    : item.evidence
                  : null,
            }))
        : [],
    },
  };
}

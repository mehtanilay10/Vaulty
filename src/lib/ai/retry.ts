import { z } from "zod";
import { AiErrorCode, classifyAiError } from "./error-codes";
import { AI_RETRY_BASE_DELAY_MS, AI_RETRY_MAX_DELAY_MS } from "./config";

export interface AiRetrySchedule {
  attempts: number;
  availableAt: Date;
}

export function calculateRetrySchedule(attempts: number): AiRetrySchedule {
  const exponentialDelay = AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempts);
  const jitter = Math.random() * 1000;
  const delay = Math.min(exponentialDelay + jitter, AI_RETRY_MAX_DELAY_MS);
  const availableAt = new Date(Date.now() + delay);
  return { attempts: attempts + 1, availableAt };
}

export function shouldRetry(error: unknown, attempts: number, maxAttempts: number): boolean {
  if (attempts >= maxAttempts) return false;
  const { code } = classifyAiError(error);
  const retryable = new Set<AiErrorCode>([
    AiErrorCode.RATE_LIMIT,
    AiErrorCode.SERVER_ERROR,
    AiErrorCode.TIMEOUT,
    AiErrorCode.DOWNLOAD_ERROR,
    AiErrorCode.UPLOAD_ERROR,
  ]);
  return retryable.has(code);
}

export function prepareRetry(
  error: unknown,
  attempts: number,
  maxAttempts: number,
): { availableAt: Date; lastError: string; errorCode: string } | null {
  if (!shouldRetry(error, attempts, maxAttempts)) return null;
  const { code, message } = classifyAiError(error);
  const schedule = calculateRetrySchedule(attempts);
  return {
    availableAt: schedule.availableAt,
    lastError: message,
    errorCode: code,
  };
}

export const GeminiResponseSchema = z.object({
  extractedText: z.string(),
  summaryMarkdown: z.string(),
  interpretationMarkdown: z.string(),
});

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;

export function validateGeminiResponse(text: string): GeminiResponse {
  if (!text || text.trim().length === 0) {
    throw new Error("Empty response received from Gemini API.");
  }
  const parsed = GeminiResponseSchema.parse(JSON.parse(text));
  return {
    extractedText: parsed.extractedText || "",
    summaryMarkdown: parsed.summaryMarkdown || "## Summary\n\nNo summary available.",
    interpretationMarkdown: parsed.interpretationMarkdown || "No interpretation available.",
  };
}

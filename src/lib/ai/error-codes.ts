export const AiErrorCode = {
  RATE_LIMIT: "RATE_LIMIT",
  SERVER_ERROR: "SERVER_ERROR",
  TIMEOUT: "TIMEOUT",
  DOWNLOAD_ERROR: "DOWNLOAD_ERROR",
  UPLOAD_ERROR: "UPLOAD_ERROR",
  INVALID_FILE: "INVALID_FILE",
  INVALID_AI_RESPONSE: "INVALID_AI_RESPONSE",
  AUTH_ERROR: "AUTH_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  UNKNOWN: "UNKNOWN",
} as const;

export type AiErrorCode = (typeof AiErrorCode)[keyof typeof AiErrorCode];

const RETRYABLE_CODES = new Set<AiErrorCode>([
  AiErrorCode.RATE_LIMIT,
  AiErrorCode.SERVER_ERROR,
  AiErrorCode.TIMEOUT,
  AiErrorCode.DOWNLOAD_ERROR,
  AiErrorCode.UPLOAD_ERROR,
]);

export function isRetryableAiError(code: string): boolean {
  return RETRYABLE_CODES.has(code as AiErrorCode);
}

export function classifyAiError(error: unknown): { code: AiErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error);

  if (/429|quota|rate.?limit|resource.?exhausted|too.?many/i.test(message)) {
    return { code: AiErrorCode.RATE_LIMIT, message };
  }
  if (/500|502|503|504/i.test(message)) {
    return { code: AiErrorCode.SERVER_ERROR, message };
  }
  if (/timeout|timed.?out|deadline/i.test(message)) {
    return { code: AiErrorCode.TIMEOUT, message };
  }
  if (/download|network|fetch|socket|econnreset|enotfound/i.test(message)) {
    return { code: AiErrorCode.DOWNLOAD_ERROR, message };
  }
  if (/upload|write|permission|access.?denied|403|401/i.test(message)) {
    return { code: AiErrorCode.UPLOAD_ERROR, message };
  }
  if (/invalid.?file|unsupported|mime|format|corrupt/i.test(message)) {
    return { code: AiErrorCode.INVALID_FILE, message };
  }
  if (/invalid.?response|malformed|json|parse|schema/i.test(message)) {
    return { code: AiErrorCode.INVALID_AI_RESPONSE, message };
  }
  if (/auth|credential|invalid.?key|401|403/i.test(message)) {
    return { code: AiErrorCode.AUTH_ERROR, message };
  }
  if (/config|env|missing|not.?configured/i.test(message)) {
    return { code: AiErrorCode.CONFIGURATION_ERROR, message };
  }

  return { code: AiErrorCode.UNKNOWN, message };
}

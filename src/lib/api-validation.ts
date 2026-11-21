/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

const JsonObjectSchema = z.record(z.string(), z.any());

/** Standard base64 with optional padding, used for salts and IVs. */
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isBase64(value: string): boolean {
  return BASE64_PATTERN.test(value);
}

export type JsonRecordError = "invalid_json" | "not_an_object";

export interface JsonRecordResult {
  success: boolean;
  data: Record<string, any> | null;
  error: JsonRecordError | null;
}

/** Parse JSON bodies and return distinguished result for invalid JSON vs not an object. */
export async function parseJsonRecord(req: {
  json: () => Promise<unknown>;
  headers?: Headers | { get: (name: string) => string | null };
}): Promise<JsonRecordResult> {
  if (req.headers && typeof req.headers.get === "function") {
    const contentType = req.headers.get("content-type");
    if (contentType && !contentType.toLowerCase().includes("application/json")) {
      return { success: false, data: null, error: "invalid_json" };
    }
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { success: false, data: null, error: "invalid_json" };
  }

  const parsed = JsonObjectSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, data: null, error: "not_an_object" };
  }

  return { success: true, data: parsed.data, error: null };
}

export type JsonRequest = {
  json: () => Promise<unknown>;
  headers?: Headers | { get: (name: string) => string | null };
};

/** Parse JSON bodies as plain objects before route-specific field validation. */
export async function readJsonRecord(
  req: JsonRequest,
  options?: { detailed?: false },
): Promise<Record<string, any> | null>;
export async function readJsonRecord(
  req: JsonRequest,
  options: { detailed: true },
): Promise<JsonRecordResult>;
export async function readJsonRecord(
  req: JsonRequest,
  options?: { detailed?: boolean },
): Promise<Record<string, any> | null | JsonRecordResult> {
  const result = await parseJsonRecord(req);
  if (options?.detailed) {
    return result;
  }
  return result.success ? result.data : null;
}

import { AI_WORKER_BATCH_INTERVAL_MS as DEFAULT_BATCH_INTERVAL_MS } from "@/lib/constants";

function parsePositiveIntEnv(name: string, defaultValue: number): number {
  const val = process.env[name];
  if (val === undefined || val.trim() === "") {
    return defaultValue;
  }
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid environment variable ${name}: expected a number, got "${val}"`);
  }
  return parsed;
}

export const AI_WORKER_CONCURRENCY = parsePositiveIntEnv("AI_WORKER_CONCURRENCY", 2);
export const AI_MIN_REQUEST_GAP_MS = parsePositiveIntEnv("AI_MIN_REQUEST_GAP_MS", 60000);
export const AI_MAX_RETRIES = parsePositiveIntEnv("AI_MAX_RETRIES", 5);
export const AI_RETRY_BASE_DELAY_MS = parsePositiveIntEnv("AI_RETRY_BASE_DELAY_MS", 3000);
export const AI_RETRY_MAX_DELAY_MS = parsePositiveIntEnv("AI_RETRY_MAX_DELAY_MS", 60000);
export const AI_PROCESSING_TIMEOUT_MS = parsePositiveIntEnv(
  "AI_PROCESSING_TIMEOUT_MS",
  30 * 60 * 1000,
);
export const AI_WORKER_POLL_INTERVAL_MS = parsePositiveIntEnv("AI_WORKER_POLL_INTERVAL_MS", 5000);
export const AI_WORKER_BATCH_SIZE = parsePositiveIntEnv("AI_WORKER_BATCH_SIZE", 2);
export const AI_WORKER_BATCH_INTERVAL_MS = parsePositiveIntEnv(
  "AI_WORKER_BATCH_INTERVAL_MS",
  DEFAULT_BATCH_INTERVAL_MS,
);

export function getWorkerId(): string {
  return (
    process.env.AI_WORKER_ID || `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  );
}

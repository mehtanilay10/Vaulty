export interface QueueItem<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 3000;
const MIN_GAP_MS = 60_000;
const CONCURRENCY = 1;

const queue: QueueItem<unknown>[] = [];
let activeCount = 0;
let lastCompletedAt = 0;
let isProcessing = false;

export function enqueue<T>(id: string, fn: () => Promise<T>, retries = 0): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      id,
      execute: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
      retries,
    });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    while (queue.length > 0 && activeCount < CONCURRENCY) {
      const item = queue.shift();
      if (!item) break;

      activeCount++;

      const doWork = async () => {
        const now = Date.now();
        const timeSinceLastCompletion = now - lastCompletedAt;
        if (timeSinceLastCompletion < MIN_GAP_MS) {
          await sleep(MIN_GAP_MS - timeSinceLastCompletion);
        }

        const delay = getRetryDelay(item.retries);
        await sleep(delay);
        return item.execute();
      };

      void (async () => {
        try {
          const result = await doWork();
          lastCompletedAt = Date.now();
          item.resolve(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isRateLimit = /429|quota|rate.?limit|resource.?exhausted|too.?many/i.test(message);
          const isServerError = /500|502|503|504/i.test(message);

          if ((isRateLimit || isServerError) && item.retries < MAX_RETRIES) {
            const backoff = getRetryDelay(item.retries);
            setTimeout(() => {
              enqueue(item.id, item.execute, item.retries + 1)
                .then(item.resolve)
                .catch(item.reject);
            }, backoff);
            return;
          }
          item.reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
          activeCount--;
          processQueue();
        }
      })();
    }
  } finally {
    isProcessing = false;
  }
}

function getRetryDelay(retries: number): number {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, retries);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, 60000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

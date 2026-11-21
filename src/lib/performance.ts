/**
 * Modern Web Performance Helpers
 * Yield execution to the main thread to allow pending user interactions,
 * input events, and browser rendering to process without blocking (optimizing INP).
 */

export async function yieldToMain(): Promise<void> {
  if (
    typeof window !== "undefined" &&
    "scheduler" in window &&
    typeof (window as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler
      ?.yield === "function"
  ) {
    return await (
      window as unknown as { scheduler: { yield: () => Promise<void> } }
    ).scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Process a large array in chunks, yielding to the main thread every `chunkSize` iterations.
 */
export async function processInChunks<T, R>(
  items: T[],
  processItem: (item: T, index: number) => R | Promise<R>,
  chunkSize = 50,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await processItem(items[i], i));
    if ((i + 1) % chunkSize === 0) {
      await yieldToMain();
    }
  }
  return results;
}

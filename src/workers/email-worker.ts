import "dotenv/config";

import { syncAllEmailConnections } from "@/lib/sync/email-sync-engine";

const POLL_INTERVAL_MS = Number(process.env.EMAIL_WORKER_POLL_INTERVAL_MS || 5 * 60 * 1000);
let isShuttingDown = false;
let isJobActive = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runEmailWorker() {
  console.log(
    `[WORKER] Starting Email Transaction Worker daemon (polling every ${Math.round(POLL_INTERVAL_MS / 1000)}s)...`,
  );
  let cycleCount = 0;

  while (!isShuttingDown) {
    cycleCount++;
    isJobActive = true;
    const cycleStart = Date.now();

    try {
      console.log(`\n============================================================`);
      console.log(
        `[WORKER] [Cycle #${cycleCount}] Initiating email sync cycle at ${new Date().toISOString()}...`,
      );
      console.log(`============================================================`);

      const result = await syncAllEmailConnections({
        maxPages: 10,
        autoImportThreshold: 0.9,
      });

      const totalAutoImported = result.results.reduce(
        (acc, r) => acc + r.transactionsAutoImported,
        0,
      );
      const totalPending = result.results.reduce((acc, r) => acc + r.transactionsPendingReview, 0);
      const totalDocuments = result.results.reduce(
        (acc, r) => acc + (r.documentsDiscovered || 0),
        0,
      );
      const totalRemindersAuto = result.results.reduce(
        (acc, r) => acc + (r.remindersAutoImported || 0),
        0,
      );
      const totalRemindersPending = result.results.reduce(
        (acc, r) => acc + (r.remindersPendingReview || 0),
        0,
      );
      const totalScanned = result.results.reduce((acc, r) => acc + r.emailsScanned, 0);
      const totalPdfs = result.results.reduce((acc, r) => acc + r.pdfsProcessed, 0);
      const allErrors = [...result.errors, ...result.results.flatMap((r) => r.errors)];

      const durationSec = ((Date.now() - cycleStart) / 1000).toFixed(1);

      console.log(`------------------------------------------------------------`);
      console.log(`[WORKER] [Cycle #${cycleCount}] Summary (${durationSec}s):`);
      for (const r of result.results) {
        console.log(
          `  • ${r.provider} (User: ${r.userId}): ${r.pagesProcessed} page(s), ` +
            `${r.emailsScanned} scanned, ${r.emailsClassified} classified, ` +
            `${r.transactionsAutoImported} auto-imported tx, ${r.transactionsPendingReview} tx review, ` +
            `${r.documentsDiscovered || 0} document(s), ` +
            `${r.remindersAutoImported || 0} auto-reminders, ${r.remindersPendingReview || 0} reminder review, ` +
            `${r.pdfsProcessed} PDF(s)${r.hasMorePages ? " [more pages available in lookback]" : " [caught up]"}`,
        );
      }
      console.log(
        `[WORKER] Totals: ${result.usersProcessed} account(s) | ${totalScanned} scanned | ` +
          `${totalAutoImported} auto tx | ${totalPending} review tx | ` +
          `${totalDocuments} docs | ${totalRemindersAuto} auto reminders | ${totalRemindersPending} review reminders | ` +
          `${totalPdfs} PDF(s) | ${allErrors.length} error(s).`,
      );

      if (allErrors.length > 0) {
        console.warn("[WORKER] Cycle issues:", allErrors);
      }
      console.log(`============================================================\n`);
    } catch (cycleError) {
      console.error("[WORKER] Uncaught cycle error:", cycleError);
    } finally {
      isJobActive = false;
    }

    if (isShuttingDown) break;

    console.log(`[WORKER] Next cycle in ${Math.round(POLL_INTERVAL_MS / 1000)}s...`);
    // Sleep in small increments so shutdown signals respond immediately
    const startSleep = Date.now();
    while (Date.now() - startSleep < POLL_INTERVAL_MS && !isShuttingDown) {
      await sleep(1000);
    }
  }

  console.log("[WORKER] Worker loop terminated cleanly.");
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[WORKER] Received ${signal}. Shutting down gracefully...`);

  // Wait briefly if a cycle is in flight
  const startWait = Date.now();
  while (isJobActive && Date.now() - startWait < 10000) {
    await sleep(250);
  }

  console.log("[WORKER] Shutdown complete. Exiting.");
  process.exit(0);
}

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

runEmailWorker().catch((err) => {
  console.error("[WORKER] Fatal crash:", err);
  process.exit(1);
});

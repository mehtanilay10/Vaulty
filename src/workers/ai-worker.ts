import dotenv from "dotenv";
dotenv.config();

import { runAiWorker, stopAiWorker, waitForActiveJobs } from "@/lib/ai/worker";

const worker = runAiWorker();

let isShuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}. Shutting down AI worker gracefully...`);
  stopAiWorker();
  try {
    await waitForActiveJobs(10000);
    console.log("AI worker shutdown complete.");
  } catch (err) {
    console.error("Error waiting for active jobs during shutdown:", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

worker.catch((err) => {
  console.error("AI worker crashed:", err);
  process.exit(1);
});

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

const DOWNLOAD_DIR = process.env.LOCAL_EMAILS_DIR || "D:\\TempHub\\Emails";

async function resetDatabase() {
  console.log(`\n============================================================`);
  console.log(`Clearing Wealth Database records...`);
  console.log(`============================================================`);

  let attempts = 0;
  while (attempts < 3) {
    try {
      const txRes = await prisma.wealthTransaction.deleteMany({});
      console.log(`✓ Deleted ${txRes.count} WealthTransaction row(s).`);

      const importRes = await prisma.emailTransactionImport.deleteMany({});
      console.log(`✓ Deleted ${importRes.count} EmailTransactionImport row(s).`);

      const accRes = await prisma.wealthAccount.deleteMany({});
      console.log(`✓ Deleted ${accRes.count} WealthAccount row(s).`);

      const gRes = await prisma.gmailConnection.updateMany({
        data: { lastSyncedAt: null, syncPageToken: null },
      });
      console.log(`✓ Reset sync state on ${gRes.count} Gmail connection(s).`);

      const oRes = await prisma.outlookConnection.updateMany({
        data: { lastSyncedAt: null, syncPageToken: null },
      });
      console.log(`✓ Reset sync state on ${oRes.count} Outlook connection(s).`);
      return;
    } catch (dbErr) {
      attempts++;
      console.warn(
        `  ⚠️ Database attempt ${attempts}/3 failed:`,
        dbErr instanceof Error ? dbErr.message : dbErr,
      );
      if (attempts >= 3) throw dbErr;
      await new Promise((r) => setTimeout(r, attempts * 2000));
    }
  }
}

function resetLocalFiles() {
  console.log(`\n============================================================`);
  console.log(`Resetting local email files in ${DOWNLOAD_DIR}...`);
  console.log(`============================================================`);

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    console.error(`Directory ${DOWNLOAD_DIR} not found.`);
    return;
  }

  const allFiles = fs.readdirSync(DOWNLOAD_DIR);
  let resetCount = 0;
  let alreadyPendingCount = 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const file of allFiles) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;

    const filePath = path.join(DOWNLOAD_DIR, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const record = JSON.parse(raw);

      // Determine target filename (ensure it starts with PENDING_)
      let targetFilename = file;
      if (!file.startsWith("PENDING_")) {
        const firstUnderscore = file.indexOf("_");
        if (firstUnderscore !== -1) {
          const remainder = file.slice(firstUnderscore + 1);
          targetFilename = `PENDING_${remainder}`;
        } else {
          targetFilename = `PENDING_${file}`;
        }
      }

      const targetPath = path.join(DOWNLOAD_DIR, targetFilename);

      // Reset JSON record fields
      record.status = "PENDING";
      delete record.score;
      delete record.aiResult;
      delete record.importedTransactionId;
      delete record.error;
      delete record.processedAt;

      fs.writeFileSync(targetPath, JSON.stringify(record, null, 2), "utf-8");

      if (filePath !== targetPath) {
        fs.unlinkSync(filePath);
        resetCount++;
      } else {
        alreadyPendingCount++;
      }

      rows.push({
        Status: "PENDING",
        Provider: record.provider,
        Date: record.date,
        From: record.from,
        Subject: record.subject,
        Amount: "",
        Currency: "",
        Type: "",
        Merchant: "",
        Bank: "",
        Confidence: "",
        Score: "",
        Reason: "",
        FileName: targetFilename,
      });
    } catch (err) {
      console.warn(`Failed to process ${file}:`, err);
    }
  }

  console.log(`✓ Reset ${resetCount} previously classified/filtered file(s) back to PENDING.`);
  console.log(`✓ Kept ${alreadyPendingCount} already-pending file(s).`);
  console.log(`✓ Total pending files ready to re-process: ${rows.length}`);

  // Sort rows: Date desc
  rows.sort((a, b) => {
    const dateA = String(a.Date || "");
    const dateB = String(b.Date || "");
    return dateB.localeCompare(dateA);
  });

  // Regenerate Excel & CSV summary
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Emails Summary");

  const xlsxPath = path.join(DOWNLOAD_DIR, "_emails_summary.xlsx");
  const csvPath = path.join(DOWNLOAD_DIR, "_emails_summary.csv");

  XLSX.writeFile(workbook, xlsxPath);
  const csvContent = XLSX.utils.sheet_to_csv(worksheet);
  fs.writeFileSync(csvPath, csvContent, "utf-8");

  console.log(`\n============================================================`);
  console.log(`📊 Reset Excel & CSV reports:`);
  console.log(`   Excel: ${xlsxPath}`);
  console.log(`   CSV:   ${csvPath}`);
  console.log(`============================================================\n`);
}

async function main() {
  await resetDatabase();
  resetLocalFiles();
}

main()
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

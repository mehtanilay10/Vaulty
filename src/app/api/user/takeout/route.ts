import { NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderForDocument } from "@/lib/storage/factory";
import { zipSync, strToU8 } from "fflate";

export const maxDuration = 60;

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

function arrayToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(","));
  return [headerLine, ...dataLines].join("\r\n");
}

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.length;
    }
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch user profile
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        defaultStorageProvider: true,
        reminderEmailsEnabled: true,
        reminderInAppEnabled: true,
        pushNotificationsEnabled: true,
        emailVerified: true,
      },
    });

    // 2. Fetch wealth accounts and transactions
    const accounts = await prisma.wealthAccount.findMany({
      where: { ownerId: user.id },
      include: {
        transactions: {
          orderBy: { date: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const accountsCsvRows = accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      status: acc.status,
      bankName: acc.bankName || "",
      accountNumber: acc.accountNumber || "",
      currentBalance: acc.currentBalance.toString(),
      currency: acc.currency,
      creditLimit: acc.creditLimit?.toString() || "",
      dueDate: acc.dueDate || "",
      category: acc.category || "",
      createdAt: acc.createdAt.toISOString(),
      updatedAt: acc.updatedAt.toISOString(),
    }));

    const accountMap = new Map<string, string>();
    accounts.forEach((a) => accountMap.set(a.id, a.name));

    const transactionsCsvRows = accounts.flatMap((acc) =>
      acc.transactions.map((tx) => ({
        id: tx.id,
        accountName: acc.name,
        date: tx.date.toISOString(),
        type: tx.type,
        amount: tx.amount.toString(),
        currency: tx.currency,
        description: tx.description,
        balanceAfter: tx.balanceAfter.toString(),
        category: tx.category || "",
        subcategory: tx.subcategory || "",
        referenceNumber: tx.referenceNumber || "",
        notes: tx.notes || "",
      })),
    );

    // 3. Fetch encrypted credentials (never decrypted on server)
    const vault = await prisma.passwordVault.findUnique({
      where: { userId: user.id },
      include: {
        appCredentials: true,
        bankCredentials: true,
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 500,
        },
      },
    });

    const auditLogsCsvRows = (vault?.auditLogs || []).map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      ipAddress: log.ipAddress || "",
      userAgent: log.userAgent || "",
      metadata: log.metadata || "",
    }));

    // 4. Fetch reminders
    const reminders = await prisma.reminder.findMany({
      where: { userId: user.id },
      orderBy: { dueAt: "asc" },
    });

    // 5. Fetch documents metadata
    const documents = await prisma.document.findMany({
      where: { ownerId: user.id },
      include: {
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        aiProcessing: {
          select: {
            status: true,
            extractedText: true,
            summaryMarkdown: true,
            interpretationMarkdown: true,
            extractedMetadata: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Build the archive files map for fflate
    const zipFiles: Record<string, Uint8Array> = {};

    // Manifest / README
    const timestamp = new Date().toISOString();
    const manifestText = `Vaulty Account Takeout & Data Export
======================================
Generated: ${timestamp}
Account ID: ${user.id}
Email: ${user.email}

Archive Contents:
-----------------
- profile.json: Basic user profile details and settings.
- wealth/accounts.csv: All configured wealth and banking accounts.
- wealth/transactions.csv: Full transaction history across all accounts.
- credentials/encrypted-vault-export.json: Client-side envelope-encrypted credentials (AES-256-GCM / PBKDF2). These cannot be decrypted by the server; retain your master password or offline recovery key to decrypt.
- documents/documents.json: Metadata, classifications, tags, dates, and AI analysis for your documents.
- documents/originals/: Original uploaded document files (PDFs, images) retrieved from storage.
- reminders/reminders.json: Active and completed reminders.
- audit-logs.csv: Security and password audit event log.

Security Notice:
----------------
This export contains sensitive personal data. Store this archive in an encrypted, secure location.
`;
    zipFiles["README.txt"] = strToU8(manifestText);

    // Profile JSON
    zipFiles["profile.json"] = strToU8(JSON.stringify(userRecord, null, 2));

    // Wealth CSVs
    zipFiles["wealth/accounts.csv"] = strToU8(
      arrayToCsv(
        [
          "id",
          "name",
          "type",
          "status",
          "bankName",
          "accountNumber",
          "currentBalance",
          "currency",
          "creditLimit",
          "dueDate",
          "category",
          "createdAt",
          "updatedAt",
        ],
        accountsCsvRows,
      ),
    );

    zipFiles["wealth/transactions.csv"] = strToU8(
      arrayToCsv(
        [
          "id",
          "accountName",
          "date",
          "type",
          "amount",
          "currency",
          "description",
          "balanceAfter",
          "category",
          "subcategory",
          "referenceNumber",
          "notes",
        ],
        transactionsCsvRows,
      ),
    );

    // Credentials Export (client-side encrypted envelopes)
    zipFiles["credentials/encrypted-vault-export.json"] = strToU8(
      JSON.stringify(
        {
          exportNotice:
            "This file contains client-side encrypted credential envelopes. Passwords and sensitive PINs are encrypted using AES-256-GCM and PBKDF2.",
          exportedAt: timestamp,
          appCredentials: vault?.appCredentials || [],
          bankCredentials: vault?.bankCredentials || [],
        },
        null,
        2,
      ),
    );

    // Audit Logs CSV
    zipFiles["audit-logs.csv"] = strToU8(
      arrayToCsv(
        ["id", "action", "createdAt", "ipAddress", "userAgent", "metadata"],
        auditLogsCsvRows,
      ),
    );

    // Reminders JSON
    zipFiles["reminders/reminders.json"] = strToU8(JSON.stringify(reminders, null, 2));

    // Document Metadata JSON
    zipFiles["documents/documents.json"] = strToU8(
      JSON.stringify(
        documents.map((d) => ({
          id: d.id,
          name: d.name,
          mimeType: d.mimeType,
          sizeBytes: d.sizeBytes,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          folder: d.folder ? d.folder.name : null,
          tags: d.tags.map((t) => t.tag.name),
          expiryDate: d.expiryDate,
          storageProvider: d.storageProvider,
          storageFileId: d.storageFileId,
          aiProcessing: d.aiProcessing
            ? {
                status: d.aiProcessing.status,
                extractedText: d.aiProcessing.extractedText,
                summaryMarkdown: d.aiProcessing.summaryMarkdown,
                interpretationMarkdown: d.aiProcessing.interpretationMarkdown,
                extractedMetadata: d.aiProcessing.extractedMetadata,
              }
            : null,
        })),
        null,
        2,
      ),
    );

    // Fetch document originals (best effort, limited to prevent timeout/OOM).
    // A cumulative byte budget keeps the in-memory ZIP bounded even when many
    // large files are present.
    const MAX_TAKEOUT_FILE_BYTES = 50 * 1024 * 1024;
    const MAX_TAKEOUT_TOTAL_BYTES = 200 * 1024 * 1024;
    const docsToFetch = documents.filter((d) => d.storageFileId).slice(0, 50);
    let totalOriginalBytes = 0;
    for (const doc of docsToFetch) {
      if (!doc.storageFileId) continue;
      if (doc.sizeBytes > MAX_TAKEOUT_FILE_BYTES) {
        console.warn(`Skipping oversized document ${doc.id} (${doc.sizeBytes} bytes) in takeout.`);
        continue;
      }
      if (totalOriginalBytes >= MAX_TAKEOUT_TOTAL_BYTES) {
        console.warn("Takeout original-files budget exhausted; remaining files skipped.");
        break;
      }
      try {
        const { provider } = await getProviderForDocument({
          id: doc.id,
          storageProvider: doc.storageProvider,
          storageFileId: doc.storageFileId,
          ownerId: doc.ownerId,
          folderId: doc.folderId,
        });

        const stream = await provider.downloadFileStream(doc.storageFileId);
        const fileBytes = await streamToUint8Array(stream);
        totalOriginalBytes += fileBytes.length;
        if (totalOriginalBytes > MAX_TAKEOUT_TOTAL_BYTES) {
          console.warn("Takeout original-files budget exhausted; remaining files skipped.");
          break;
        }

        // Sanitize filename
        const safeName = doc.name.replace(/[/\\?%*:|"<>]/g, "_");
        const filename = `${doc.id.slice(0, 8)}_${safeName}`;
        zipFiles[`documents/originals/${filename}`] = fileBytes;
      } catch (err) {
        console.warn(`Could not download file for document ${doc.id}:`, err);
      }
    }

    // Generate ZIP
    const zipBytes = zipSync(zipFiles);
    const dateSlug = timestamp.slice(0, 10);

    return new Response(zipBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="vaulty-takeout-${dateSlug}.zip"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("GET /api/user/takeout error:", error);
    return NextResponse.json(
      { error: "Failed to generate account takeout archive." },
      { status: 500 },
    );
  }
}

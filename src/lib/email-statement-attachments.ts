import { prisma } from "@/lib/prisma";
import { getPdfPasswordConfig, generatePdfPasswordCandidates } from "@/lib/pdf-passwords";
import { parseTextStatementWithAiFallback } from "@/lib/statement-parser";
import {
  extractAccountLastFour,
  extractAccountNumberHint,
  matchFinancialAccount,
} from "@/lib/gmail/account-matching";
import { removeDuplicateTransactions } from "@/lib/gmail/dedupe-transactions";

export interface FinancialMailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}
export interface FinancialMailContext {
  ownerId: string;
  provider: "GMAIL" | "OUTLOOK" | "FORWARDING";
  messageId: string;
  threadId?: string | null;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

const MAX_EXTRACTED_TEXT_LENGTH = 2 * 1024 * 1024; // 2MB limit on extracted text

export async function extractPdfText(data: Buffer, password?: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(data), ...(password ? { password } : {}) });
  let pdf: Awaited<typeof task.promise> | null = null;
  try {
    pdf = await task.promise;
    if (pdf.numPages > 500) throw new Error("PDF exceeds the supported page limit.");
    const pages: string[] = [];
    let totalTextLength = 0;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      try {
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: { str?: string } | unknown) =>
            item && typeof item === "object" && "str" in item
              ? String((item as { str: string }).str)
              : "",
          )
          .join(" ");

        totalTextLength += pageText.length;
        if (totalTextLength > MAX_EXTRACTED_TEXT_LENGTH) {
          const remaining = MAX_EXTRACTED_TEXT_LENGTH - (totalTextLength - pageText.length);
          if (remaining > 0) {
            pages.push(pageText.slice(0, remaining));
          }
          break;
        }
        pages.push(pageText);
      } finally {
        page.cleanup();
      }
    }
    return pages.join("\n");
  } finally {
    try {
      if (pdf) {
        await pdf.cleanup();
      }
    } catch {
      // Ignore document cleanup failure
    }
    try {
      await task.destroy();
    } catch {
      // Ignore task destroy failure
    }
  }
}
function senderInstitution(context: FinancialMailContext) {
  const domain = context.from.split("@").pop()?.replace(/[<>]/g, "").toLowerCase() || "";
  const labels = domain.split(".");
  const generic = /^(alerts?|notifications?|noreply|no-?reply|mailer|email|mail|secure)$/i;
  return labels.find((label) => label && !generic.test(label)) || "";
}
function institutionTemplateHint(context: FinancialMailContext) {
  return `${senderInstitution(context)} ${context.subject}`.slice(0, 100);
}

export async function processFinancialPdfAttachments(
  context: FinancialMailContext,
  attachments: FinancialMailAttachment[],
) {
  const pdfs = attachments
    .filter(
      (attachment) =>
        attachment.mimeType.toLowerCase() === "application/pdf" ||
        attachment.filename.toLowerCase().endsWith(".pdf"),
    )
    .slice(0, 5);
  if (!pdfs.length) return { attachments: 0, extracted: 0, added: 0, duplicates: 0, failed: 0 };

  const config = await getPdfPasswordConfig(context.ownerId);
  const bankHint = senderInstitution(context);
  const templateHint = institutionTemplateHint(context);
  const passwordCandidates = generatePdfPasswordCandidates(
    config,
    templateHint || context.subject,
    `${context.subject}\n${context.body}`,
  );
  const accounts = await prisma.wealthAccount.findMany({
    where: { ownerId: context.ownerId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      bankName: true,
      provider: true,
      accountNumber: true,
      currency: true,
    },
  });
  const accountId = matchFinancialAccount(
    accounts,
    bankHint || null,
    extractAccountLastFour(`${context.subject}\n${context.body}`),
    extractAccountNumberHint(`${context.subject}\n${context.body}`),
  );
  let extracted = 0,
    failed = 0,
    added = 0,
    duplicates = 0;
  const allCandidates: Array<Record<string, unknown>> = [];

  for (const attachment of pdfs) {
    const attachmentPrefix = `${context.provider.toLowerCase()}:${context.messageId}:pdf:${attachment.id}:`;
    const alreadyQueued = await prisma.emailTransactionImport.findFirst({
      where: { ownerId: context.ownerId, emailMessageId: { startsWith: attachmentPrefix } },
      select: { id: true },
    });
    if (alreadyQueued) continue;
    try {
      let text = "";
      try {
        text = await extractPdfText(attachment.data);
      } catch (firstError) {
        const message = firstError instanceof Error ? firstError.message : "";
        if (!/password|encrypt/i.test(message)) throw firstError;
        let unlocked = false;
        for (const candidate of passwordCandidates) {
          try {
            text = await extractPdfText(attachment.data, candidate);
            unlocked = true;
            break;
          } catch {
            // Never log or persist a candidate password.
          }
        }
        if (!unlocked)
          throw new Error("Password-protected PDF could not be opened with configured candidates.");
      }
      if (!text.trim()) throw new Error("PDF contains no extractable text.");
      extracted++;
      const parsed = await parseTextStatementWithAiFallback(text);
      const account = accounts.find((item) => item.id === accountId);
      const currency = account?.currency || "INR";
      parsed.transactions.forEach((transaction, index) => {
        const syntheticId =
          `${context.provider.toLowerCase()}:${context.messageId}:pdf:${attachment.id}:${index}`.slice(
            0,
            190,
          );
        allCandidates.push({
          ownerId: context.ownerId,
          emailMessageId: syntheticId,
          threadId: context.threadId || null,
          fromAddress: context.from.slice(0, 320) || "unknown",
          subject: `${context.subject} · ${attachment.filename}`.slice(0, 500),
          accountId,
          bankName: (bankHint || templateHint).slice(0, 120),
          merchant: null,
          description: transaction.description.slice(0, 240),
          amount: transaction.amount,
          currency,
          type: transaction.type,
          referenceNumber: transaction.referenceNumber || null,
          date: transaction.date,
          sourceProvider: context.provider,
          aiConfidence: 0.7,
          aiReason: "Extracted from a financial PDF attachment; verify details before importing.",
          aiClassifiedAt: new Date(),
          updatedAt: new Date(),
        });
      });
    } catch {
      failed++;
      // Avoid logging document text, personal data, or parser errors that may echo passwords.
    }
  }

  if (!allCandidates.length)
    return { attachments: pdfs.length, extracted, added, duplicates, failed };
  const [pending, saved] = await Promise.all([
    prisma.emailTransactionImport.findMany({
      where: { ownerId: context.ownerId, status: { in: ["PENDING", "IMPORTED"] } },
      select: {
        amount: true,
        currency: true,
        type: true,
        date: true,
        referenceNumber: true,
        bankName: true,
        merchant: true,
        description: true,
      },
    }),
    prisma.wealthTransaction.findMany({
      where: { account: { ownerId: context.ownerId } },
      select: {
        amount: true,
        currency: true,
        type: true,
        date: true,
        referenceNumber: true,
        description: true,
        account: { select: { bankName: true, name: true } },
      },
    }),
  ]);
  const fingerprints = [
    ...pending,
    ...saved.map((item) => ({ ...item, bankName: item.account.bankName || item.account.name })),
  ];
  const unique = removeDuplicateTransactions(allCandidates as never[], fingerprints);
  duplicates = allCandidates.length - unique.length;
  if (unique.length) {
    const result = await prisma.emailTransactionImport.createMany({
      data: unique as never[],
      skipDuplicates: true,
    });
    added = result.count;
    duplicates += unique.length - result.count;
  }
  return { attachments: pdfs.length, extracted, added, duplicates, failed };
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit-log";
import { validateCSRFRequest } from "@/lib/csrf";
import { getBalanceDelta } from "@/lib/wealth";
import { z } from "zod";

const commitItemSchema = z.object({
  candidateId: z.string().min(1, "Candidate ID is required."),
  accountId: z.string().min(1, "Account ID is required."),
});

const commitRequestSchema = z.object({
  items: z
    .array(commitItemSchema)
    .min(1, "Select between 1 and 100 transactions to import.")
    .max(100, "Select between 1 and 100 transactions to import."),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validateCSRFRequest(req))
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });

  const rawBody = await req.json().catch(() => null);
  const parsed = commitRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message || "Select between 1 and 100 transactions to import.",
      },
      { status: 400 },
    );
  }

  const { items } = parsed.data;

  const candidateIds = items.map((item) => item.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    return NextResponse.json({ error: "Duplicate transaction selection." }, { status: 400 });
  }

  const candidates = await prisma.emailTransactionImport.findMany({
    where: { id: { in: candidateIds }, ownerId: user.id, status: "PENDING" },
  });
  if (candidates.length !== items.length) {
    return NextResponse.json(
      { error: "One or more transactions are no longer pending." },
      { status: 409 },
    );
  }

  const itemByCandidate = new Map(items.map((item) => [item.candidateId, item]));
  const accountIds = [...new Set(items.map((item) => item.accountId))];
  const accounts = await prisma.wealthAccount.findMany({
    where: { id: { in: accountIds }, ownerId: user.id, status: "ACTIVE" },
  });
  if (accounts.length !== accountIds.length) {
    return NextResponse.json(
      { error: "One or more selected accounts are unavailable." },
      { status: 404 },
    );
  }

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  for (const candidate of candidates) {
    const accountId = itemByCandidate.get(candidate.id)!.accountId;
    const account = accountById.get(accountId)!;
    if (candidate.currency !== account.currency) {
      return NextResponse.json(
        {
          error: `${candidate.description} is in ${candidate.currency}, but ${account.name} uses ${account.currency}. Choose an account with a matching currency.`,
        },
        { status: 400 },
      );
    }
  }

  try {
    const importedCount = await prisma.$transaction(async (tx) => {
      let count = 0;

      // Batch fetch all selected accounts inside transaction in a single query to eliminate N+1 queries
      const activeAccounts = await tx.wealthAccount.findMany({
        where: { id: { in: accountIds }, ownerId: user.id, status: "ACTIVE" },
      });
      if (activeAccounts.length !== accountIds.length) {
        throw new Error("A selected wealth account is no longer active or available.");
      }
      const activeAccountById = new Map(activeAccounts.map((acc) => [acc.id, acc]));

      const grouped = new Map<string, typeof candidates>();
      for (const candidate of candidates) {
        const accountId = itemByCandidate.get(candidate.id)!.accountId;
        const group = grouped.get(accountId) || [];
        group.push(candidate);
        grouped.set(accountId, group);
      }

      for (const [accountId, accountCandidates] of grouped) {
        const account = activeAccountById.get(accountId);
        if (!account)
          throw new Error("A selected wealth account is no longer active or available.");

        let currentRunning = Number(account.currentBalance);
        const ordered = [...accountCandidates].sort((a, b) => a.date.getTime() - b.date.getTime());
        for (const candidate of ordered) {
          // Claim the candidate with a conditional status update. If another request
          // imports it concurrently, only one transaction can claim the PENDING row.
          const claimed = await tx.emailTransactionImport.updateMany({
            where: { id: candidate.id, ownerId: user.id, status: "PENDING" },
            data: { status: "IMPORTED", accountId, importedAt: new Date() },
          });
          if (claimed.count !== 1) continue;

          const delta = getBalanceDelta(account.type, candidate.type, Number(candidate.amount));
          currentRunning += delta;

          await tx.wealthTransaction.create({
            data: {
              accountId,
              type: candidate.type,
              amount: Number(candidate.amount),
              currency: candidate.currency,
              description: candidate.description,
              referenceNumber: candidate.referenceNumber,
              date: candidate.date,
              balanceAfter: currentRunning.toFixed(2),
              notes: `Imported from ${candidate.sourceProvider === "FORWARDING" ? "forwarded email" : candidate.sourceProvider === "OUTLOOK" ? "Outlook" : "Gmail"} alert (${candidate.fromAddress}).`,
            },
          });
          count += 1;
        }

        await tx.wealthAccount.update({
          where: { id: accountId },
          data: { currentBalance: currentRunning.toFixed(2) },
        });
      }
      return count;
    });

    await createAuditLog({
      userId: user.id,
      action: "EMAIL_TRANSACTION_IMPORT",
      metadata: {
        importedCount,
        skippedCount: candidates.length - importedCount,
        sources: [...new Set(candidates.map((candidate) => candidate.sourceProvider))],
      },
    });
    return NextResponse.json({
      success: true,
      importedCount,
      skippedCount: candidates.length - importedCount,
    });
  } catch (error) {
    console.error("POST /api/integrations/gmail/imports/commit error:", error);
    const message = error instanceof Error ? error.message : "Failed to import transactions.";
    const status = message.includes("no longer active or available") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

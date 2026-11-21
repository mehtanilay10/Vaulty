"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { Blade } from "@/components/ui/Blade";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { formatCurrency } from "@/lib/wealth";
import type { WealthAccountDTO } from "@/types";
import { GitMerge, X, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";

interface MergeAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Accounts the user has selected to be merged away (sources). */
  sourceAccounts: WealthAccountDTO[];
  /** All accounts available to merge into (master). */
  availableAccounts: WealthAccountDTO[];
  onMerged?: (targetAccountId: string) => void;
  isLoading?: boolean;
}

export function MergeAccountModal({
  isOpen,
  onClose,
  sourceAccounts,
  availableAccounts,
  onMerged,
  isLoading = false,
}: MergeAccountModalProps) {
  const router = useRouter();
  const { toast } = useFeedback();

  // Eligible master accounts: same currency as first source, not one of the sources
  const sourceIds = new Set(sourceAccounts.map((a) => a.id));
  const sourceCurrency = sourceAccounts[0]?.currency ?? "INR";
  const eligibleTargets = availableAccounts.filter(
    (acc) => !sourceIds.has(acc.id) && acc.currency === sourceCurrency,
  );

  const [explicitTargetId, setExplicitTargetId] = useState<string>("");
  const targetAccountId =
    explicitTargetId && eligibleTargets.some((t) => t.id === explicitTargetId)
      ? explicitTargetId
      : (eligibleTargets[0]?.id ?? "");

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetAccount = eligibleTargets.find((acc) => acc.id === targetAccountId);

  const totalTransactions = sourceAccounts.reduce(
    (sum, a) => sum + (a._count?.transactions ?? 0),
    0,
  );

  const handleMerge = async () => {
    if (!targetAccountId) {
      setError("Please select a master account to merge into.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Merge sources one by one into the target sequentially
      for (let i = 0; i < sourceAccounts.length; i++) {
        const src = sourceAccounts[i];
        setProgress(`Merging ${i + 1} of ${sourceAccounts.length}: "${src.name}"…`);

        const res = await fetch(`/api/wealth/accounts/${src.id}/merge`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ targetAccountId }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Failed to merge "${src.name}".`);
        }
      }

      toast(
        `Successfully merged ${sourceAccounts.length} account${sourceAccounts.length > 1 ? "s" : ""} into "${targetAccount?.name}". ${totalTransactions} transaction(s) transferred.`,
        "success",
      );
      onClose();
      if (onMerged) {
        onMerged(targetAccountId);
      } else {
        router.push(`/wealth/accounts/${targetAccountId}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge accounts.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title="Merge Wealth Accounts"
      description={`Combine ${sourceAccounts.length} selected account${sourceAccounts.length > 1 ? "s" : ""} into a single master account.`}
      icon={<GitMerge className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleMerge}
            disabled={loading || isLoading || !targetAccountId || eligibleTargets.length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Merging…
              </>
            ) : (
              <>
                <GitMerge className="w-4 h-4" />
                Merge & Remove Sources
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5 py-2">
        {error && <Alert variant="danger">{error}</Alert>}
        {progress && (
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-muted px-3 py-2 text-[12px] text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            {progress}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
            <p className="text-xs text-text-muted">Loading eligible accounts…</p>
          </div>
        ) : eligibleTargets.length === 0 ? (
          <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-center">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-warning" />
            <p className="text-[13px] font-medium text-text-primary">
              No eligible master account found
            </p>
            <p className="mt-1 text-[12px] text-text-muted">
              You need at least one other {sourceCurrency} account that is not in your selection.
            </p>
          </div>
        ) : (
          <>
            {/* Sources → Target visual */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Accounts being merged away (will be deleted)
              </p>
              <div className="rounded-lg border border-border-subtle bg-surface-muted divide-y divide-border-subtle">
                {sourceAccounts.map((src) => (
                  <div key={src.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-text-primary">
                        {src.name}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {formatCurrency(src.currentBalance, src.currency)} ·{" "}
                        {src._count?.transactions ?? 0} txns
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
                  </div>
                ))}
              </div>
            </div>

            {/* Master account selector */}
            <div className="space-y-1.5">
              <Label htmlFor="target-account-select">
                Master account (will be kept) <span className="text-danger">*</span>
              </Label>
              <Select
                id="target-account-select"
                value={targetAccountId}
                onChange={(e) => setExplicitTargetId(e.target.value)}
                disabled={loading}
              >
                {eligibleTargets.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type.replace(/_/g, " ")}) —{" "}
                    {formatCurrency(acc.currentBalance, acc.currency)}
                  </option>
                ))}
              </Select>
            </div>

            {/* What will happen */}
            <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-subtle p-3.5 text-[12px] text-text-muted">
              <p className="font-semibold text-text-primary">What will happen:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  All <strong className="text-text-primary">{totalTransactions}</strong>{" "}
                  transaction(s) from the selected accounts will be moved to{" "}
                  <strong className="text-text-primary">
                    {targetAccount?.name ?? "the master account"}
                  </strong>
                  .
                </li>
                <li>
                  Running balances (
                  <code className="rounded bg-surface-muted px-1 text-[11px]">balanceAfter</code>)
                  will be chronologically recomputed.
                </li>
                <li>Email/statement imports linked to the source accounts will be relinked.</li>
                <li>
                  The <strong className="text-text-primary">{sourceAccounts.length}</strong> source
                  account(s) will be <strong className="text-danger">permanently deleted</strong>.
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </Blade>
  );
}

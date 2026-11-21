"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { Blade } from "@/components/ui/Blade";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { formatCurrency } from "@/lib/wealth";
import type { WealthAccountDTO } from "@/types";
import { Trash2, X, AlertTriangle, Loader2 } from "lucide-react";

interface BulkDeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Accounts the user has selected to delete. */
  accounts: WealthAccountDTO[];
  onDeleted?: () => void;
}

export function BulkDeleteAccountModal({
  isOpen,
  onClose,
  accounts,
  onDeleted,
}: BulkDeleteAccountModalProps) {
  const router = useRouter();
  const { toast } = useFeedback();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalTransactions = accounts.reduce((sum, a) => sum + (a._count?.transactions ?? 0), 0);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/wealth/accounts/bulk-delete", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ accountIds: accounts.map((a) => a.id) }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete accounts.");
      }

      toast(
        `Successfully deleted ${accounts.length} account(s) and ${totalTransactions} transaction(s).`,
        "success",
      );
      onClose();
      if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete accounts.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title="Delete Wealth Accounts"
      description={`Permanently delete ${accounts.length} account(s) and all their transactions.`}
      icon={<Trash2 className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete {accounts.length} Account(s)
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5 py-2">
        {error && <Alert variant="danger">{error}</Alert>}

        {/* Accounts to be deleted */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Accounts to be deleted
          </p>
          <div className="rounded-lg border border-danger/30 bg-danger-subtle divide-y divide-danger/20">
            {accounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-text-primary">{acc.name}</p>
                  <p className="text-[11px] text-text-muted">
                    {formatCurrency(acc.currentBalance, acc.currency)} ·{" "}
                    {acc._count?.transactions ?? 0} txns
                  </p>
                </div>
                <Trash2 className="h-4 w-4 shrink-0 text-danger" />
              </div>
            ))}
          </div>
        </div>

        {/* Warning */}
        <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-warning" />
          <p className="text-[13px] font-medium text-text-primary">This action cannot be undone</p>
          <p className="mt-1 text-[12px] text-text-muted">
            All <strong className="text-text-primary">{totalTransactions}</strong> transaction(s)
            associated with these accounts will be permanently deleted.
          </p>
        </div>

        {/* What will happen */}
        <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-subtle p-3.5 text-[12px] text-text-muted">
          <p className="font-semibold text-text-primary">What will happen:</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>
              The <strong className="text-text-primary">{accounts.length}</strong> selected
              account(s) will be <strong className="text-danger">permanently deleted</strong>.
            </li>
            <li>
              All <strong className="text-text-primary">{totalTransactions}</strong> transaction(s)
              linked to these accounts will be deleted.
            </li>
            <li>Email/statement imports linked to these accounts will be deleted.</li>
            <li>This action cannot be undone.</li>
          </ul>
        </div>
      </div>
    </Blade>
  );
}

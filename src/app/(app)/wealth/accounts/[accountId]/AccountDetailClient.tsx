"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { csrfHeaders } from "@/lib/csrf-client";
import { TransactionList } from "@/components/wealth/TransactionList";

const AccountFormModal = dynamic(
  () => import("@/components/wealth/AccountFormModal").then((mod) => mod.AccountFormModal),
  { ssr: false },
);
const TransactionFormModal = dynamic(
  () => import("@/components/wealth/TransactionFormModal").then((mod) => mod.TransactionFormModal),
  { ssr: false },
);
const MergeAccountModal = dynamic(
  () => import("@/components/wealth/MergeAccountModal").then((mod) => mod.MergeAccountModal),
  { ssr: false },
);
import { PageHeader } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Blade } from "@/components/ui/Blade";
import { formatCurrency, isLiabilityType, type WealthAccountType } from "@/lib/wealth";
import type { WealthAccountDTO, WealthTransactionDTO } from "@/types";
import {
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  Wallet,
  CreditCard,
  TrendingUp,
  Home,
  Briefcase,
  Gift,
  Landmark,
  Building2,
  X,
  Copy,
  Check,
  GitMerge,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from "lucide-react";

const accountIcons: Record<WealthAccountType, LucideIcon> = {
  SAVINGS_ACCOUNT: Wallet,
  CURRENT_ACCOUNT: Wallet,
  CREDIT_CARD: CreditCard,
  MUTUAL_FUND: TrendingUp,
  STOCK_PORTFOLIO: TrendingUp,
  LOAN: Home,
  PPF: Landmark,
  PF: Landmark,
  GIFT_CARD: Gift,
  VOUCHER: Gift,
  FIXED_DEPOSIT: Briefcase,
  RECURRING_DEPOSIT: Briefcase,
  CASH: Wallet,
  OTHER: Building2,
};

const statusColors: Record<string, string> = {
  ACTIVE: "bg-success-subtle text-success",
  INACTIVE: "bg-warning-subtle text-warning",
  CLOSED: "bg-surface-muted text-text-muted",
  FROZEN: "bg-danger-subtle text-danger",
};

interface AccountDetailClientProps {
  account: WealthAccountDTO & { transactions: WealthTransactionDTO[] };
  readOnly?: boolean;
  familyOwner?: { id: string; name: string | null; email: string | null } | null;
  initialTotal?: number;
}

export function AccountDetailClient({
  account,
  readOnly = false,
  familyOwner = null,
  initialTotal,
}: AccountDetailClientProps) {
  const { toast, confirmAction } = useFeedback();
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<WealthAccountDTO[]>([]);
  const [isFetchingAccounts, setIsFetchingAccounts] = useState(false);
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<WealthTransactionDTO | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Paginated transactions
  const [transactions, setTransactions] = useState<WealthTransactionDTO[]>(
    account.transactions || [],
  );
  const [totalTransactions, setTotalTransactions] = useState<number>(
    initialTotal ?? (account.transactions?.length || 0),
  );
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  const fetchPage = useCallback(
    async (newPage: number) => {
      setIsLoadingPage(true);
      try {
        const res = await fetch(
          `/api/wealth/accounts/${account.id}/transactions?limit=${pageSize}&offset=${(newPage - 1) * pageSize}`,
        );
        if (res.ok) {
          const data = await res.json();
          setTransactions(data.transactions || []);
          if (typeof data.total === "number") setTotalTransactions(data.total);
          setPage(newPage);
        }
      } catch (e) {
        console.error("Failed to fetch transactions page", e);
      } finally {
        setIsLoadingPage(false);
      }
    },
    [account.id, pageSize],
  );

  const refreshTransactions = useCallback(
    async (targetPage = 1) => {
      router.refresh();
      await fetchPage(targetPage);
    },
    [router, fetchPage],
  );

  const [prevAccount, setPrevAccount] = useState(account);
  if (account !== prevAccount) {
    setPrevAccount(account);
    if (account.transactions) {
      setTransactions(account.transactions);
    }
  }

  const [prevTotal, setPrevTotal] = useState(initialTotal);
  if (initialTotal !== prevTotal) {
    setPrevTotal(initialTotal);
    if (typeof initialTotal === "number") {
      setTotalTransactions(initialTotal);
    }
  }

  const statusColor = statusColors[account.status] || statusColors.INACTIVE;
  const liability = isLiabilityType(account.type);

  const isAutoDiscovered =
    account.name.includes("(Auto-Discovered)") ||
    account.name.includes("(Discovered)") ||
    account.notes?.includes("Auto-created by email");

  const handleOpenMerge = async () => {
    setIsMergeOpen(true);
    setIsFetchingAccounts(true);
    try {
      const res = await fetch("/api/wealth/accounts");
      const data = await res.json();
      if (res.ok && Array.isArray(data.accounts)) {
        setAvailableAccounts(data.accounts);
      }
    } catch (err) {
      console.error("Failed to load accounts for merge:", err);
    } finally {
      setIsFetchingAccounts(false);
    }
  };

  const handleCopy = async (value: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldName);
      toast(`${fieldName} copied to clipboard.`, "success");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast("Failed to copy to clipboard.", "error");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/wealth/accounts/${account.id}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account.");
      }

      router.push("/wealth/accounts");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account.");
      setIsDeleting(false);
    }
  };

  const handleDeleteTransaction = async (transaction: WealthTransactionDTO) => {
    if (
      !(await confirmAction({
        title: "Delete transaction?",
        description: "This transaction will be permanently removed from the account ledger.",
        confirmLabel: "Delete transaction",
        tone: "danger",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/wealth/accounts/${account.id}/transactions/${transaction.id}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete transaction.");
      }
      await refreshTransactions(page);
      toast("Transaction deleted.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete transaction.", "error");
    }
  };

  return (
    <>
      <div className="space-y-3">
        <Breadcrumbs
          items={
            familyOwner
              ? [
                  { label: "Family", href: "/family" },
                  {
                    label: `${familyOwner.name || familyOwner.email || "Family member"}'s Wealth`,
                    href: `/family/${familyOwner.id}/wealth`,
                  },
                  { label: account.name },
                ]
              : [
                  { label: "Dashboard", href: "/dashboard" },
                  { label: "Wealth", href: "/wealth" },
                  { label: "Accounts", href: "/wealth/accounts" },
                  { label: account.name },
                ]
          }
        />

        <PageHeader
          eyebrow={account.type.replace(/_/g, " ")}
          title={account.name}
          description={account.provider || account.bankName || "No provider"}
          icon={(() => {
            const Icon = accountIcons[account.type as keyof typeof accountIcons] || Building2;
            return <Icon className="h-5 w-5" />;
          })()}
          actions={
            readOnly ? undefined : (
              <>
                <Button variant="secondary" onClick={handleOpenMerge}>
                  <GitMerge className="h-4 w-4" />
                  Merge
                </Button>
                <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
                <Button variant="danger" onClick={() => setIsDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            )
          }
        />
      </div>

      {isAutoDiscovered && !readOnly && (
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand-subtle p-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-text-primary">
                Auto-discovered from your email alerts
              </p>
              <p className="text-[11px] text-text-muted">
                Transactions were automatically routed here. You can customize this account or merge
                it into an existing account anytime.
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={handleOpenMerge} className="shrink-0">
            <GitMerge className="h-3.5 w-3.5" />
            Merge account
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
                  liability
                    ? "border-danger/20 bg-danger-subtle text-danger"
                    : "border-brand/15 bg-brand-subtle text-brand"
                }`}
              >
                {(function () {
                  const Icon = accountIcons[account.type as keyof typeof accountIcons] || Building2;
                  return <Icon className="h-5 w-5" />;
                })()}
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="break-words line-clamp-2 text-[13px] font-semibold text-text-primary"
                  title={account.name}
                >
                  {account.name}
                </h3>
                <p className="truncate text-[11px] text-text-muted">
                  {account.type.replace(/_/g, " ")}
                </p>
              </div>
              <Badge className={statusColor}>{account.status}</Badge>
            </div>

            <dl className="divide-y divide-border-subtle">
              <div className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="text-[11px] text-text-muted">
                  {liability ? "Outstanding balance" : "Current balance"}
                </dt>
                <dd
                  className={`text-lg font-semibold ${
                    liability ? "text-danger" : "text-text-primary"
                  }`}
                >
                  {formatCurrency(account.currentBalance, account.currency)}
                </dd>
              </div>

              {account.creditLimit !== null && account.creditLimit !== undefined && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Credit limit</dt>
                  <dd className="text-[13px] font-medium text-text-primary">
                    {formatCurrency(account.creditLimit, account.currency)}
                  </dd>
                </div>
              )}

              {account.accountNumber && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Account number</dt>
                  <dd className="flex items-center gap-1.5 truncate font-mono text-[12px] font-medium text-text-primary">
                    <span>{account.accountNumber}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(account.accountNumber!, "Account number")}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
                      aria-label="Copy account number"
                    >
                      {copiedField === "Account number" ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </dd>
                </div>
              )}

              {(account.provider || account.bankName) && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Bank / Provider</dt>
                  <dd className="truncate text-[13px] font-medium text-text-primary">
                    {account.provider || account.bankName}
                  </dd>
                </div>
              )}

              {account.branchName && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Branch</dt>
                  <dd className="truncate text-[13px] font-medium text-text-primary">
                    {account.branchName}
                  </dd>
                </div>
              )}

              {account.billingCycle && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Billing cycle</dt>
                  <dd className="truncate text-[13px] font-medium text-text-primary">
                    {account.billingCycle}
                  </dd>
                </div>
              )}

              {account.dueDate !== null && account.dueDate !== undefined && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Due date (day)</dt>
                  <dd className="text-[13px] font-medium text-text-primary">{account.dueDate}</dd>
                </div>
              )}

              {account.loanType && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Loan type</dt>
                  <dd className="truncate text-[13px] font-medium text-text-primary">
                    {account.loanType}
                  </dd>
                </div>
              )}

              {account.interestRate !== null && account.interestRate !== undefined && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Interest rate</dt>
                  <dd className="text-[13px] font-medium text-text-primary">
                    {Number(account.interestRate)}%
                  </dd>
                </div>
              )}

              {account.emiAmount !== null && account.emiAmount !== undefined && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">EMI</dt>
                  <dd className="text-[13px] font-medium text-text-primary">
                    {formatCurrency(account.emiAmount, account.currency)}
                  </dd>
                </div>
              )}

              {account.tenureMonths !== null && account.tenureMonths !== undefined && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Tenure (months)</dt>
                  <dd className="text-[13px] font-medium text-text-primary">
                    {account.tenureMonths}
                  </dd>
                </div>
              )}

              {account.startDate && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Start date</dt>
                  <dd className="text-[13px] font-medium text-text-primary">
                    {new Date(account.startDate).toLocaleDateString()}
                  </dd>
                </div>
              )}

              {account.endDate && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">End date</dt>
                  <dd className="text-[13px] font-medium text-text-primary">
                    {new Date(account.endDate).toLocaleDateString()}
                  </dd>
                </div>
              )}

              {account.expiryDate && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Expiry date</dt>
                  <dd className="text-[13px] font-medium text-text-primary">
                    {new Date(account.expiryDate).toLocaleDateString()}
                  </dd>
                </div>
              )}

              {account.isin && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">ISIN</dt>
                  <dd className="flex items-center gap-1.5 truncate font-mono text-[12px] font-medium text-text-primary">
                    <span>{account.isin}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(account.isin!, "ISIN")}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
                      aria-label="Copy ISIN"
                    >
                      {copiedField === "ISIN" ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </dd>
                </div>
              )}

              {account.broker && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Broker</dt>
                  <dd className="truncate text-[13px] font-medium text-text-primary">
                    {account.broker}
                  </dd>
                </div>
              )}

              {account.dematAccount && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Demat account</dt>
                  <dd className="flex items-center gap-1.5 truncate font-mono text-[12px] font-medium text-text-primary">
                    <span>{account.dematAccount}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(account.dematAccount!, "Demat account")}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
                      aria-label="Copy Demat account"
                    >
                      {copiedField === "Demat account" ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </dd>
                </div>
              )}

              {account.tags && account.tags.length > 0 && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {account.tags.map((tag) => (
                      <Badge key={tag} variant="default">
                        {tag}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}

              {account.pin && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">PIN</dt>
                  <dd className="truncate font-mono text-[12px] font-medium text-text-primary">
                    {account.pin}
                  </dd>
                </div>
              )}

              {account.category && (
                <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                  <dt className="text-[11px] text-text-muted">Category</dt>
                  <dd>
                    <Badge variant="default">{account.category}</Badge>
                  </dd>
                </div>
              )}

              {account.notes && (
                <div className="px-5 py-3">
                  <dt className="mb-1 text-[11px] text-text-muted">Notes</dt>
                  <dd className="whitespace-pre-wrap text-[12px] leading-relaxed text-text-secondary">
                    {account.notes}
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <SectionHeader
            icon={<Wallet className="h-4 w-4" />}
            title="Transactions"
            description="Movements recorded against this account."
            count={totalTransactions}
            action={
              readOnly ? undefined : (
                <Button size="sm" onClick={() => setIsAddTransactionOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add transaction
                </Button>
              )
            }
          />
          <div className="relative">
            {isLoadingPage && (
              <div className="absolute inset-0 z-10 bg-surface/50 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
                <Loader2 className="h-6 w-6 animate-spin text-brand" />
              </div>
            )}
            <TransactionList
              transactions={transactions}
              onEdit={readOnly ? undefined : (t) => setEditingTransaction(t)}
              onDelete={readOnly ? undefined : handleDeleteTransaction}
            />
          </div>

          {totalTransactions > pageSize && (
            <div className="flex items-center justify-between border-t border-border-subtle pt-3 px-1 text-xs text-text-muted">
              <span>
                Showing {Math.min((page - 1) * pageSize + 1, totalTransactions)}–
                {Math.min(page * pageSize, totalTransactions)} of {totalTransactions}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchPage(page - 1)}
                  disabled={page <= 1 || isLoadingPage}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-[11px] font-medium px-2">
                  Page {page} of {Math.ceil(totalTransactions / pageSize)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchPage(page + 1)}
                  disabled={page * pageSize >= totalTransactions || isLoadingPage}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isEditOpen && (
        <AccountFormModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          account={account}
          onSaved={() => router.refresh()}
        />
      )}

      {isAddTransactionOpen && (
        <TransactionFormModal
          isOpen={isAddTransactionOpen}
          onClose={() => setIsAddTransactionOpen(false)}
          accountId={account.id}
          accountCurrency={account.currency}
          accountType={account.type}
          onSaved={async () => {
            await refreshTransactions(1);
          }}
        />
      )}

      {editingTransaction && (
        <TransactionFormModal
          isOpen={!!editingTransaction}
          onClose={() => setEditingTransaction(null)}
          accountId={account.id}
          accountCurrency={account.currency}
          accountType={account.type}
          transaction={editingTransaction}
          onSaved={async () => {
            setEditingTransaction(null);
            await refreshTransactions(page);
          }}
        />
      )}

      {isMergeOpen && (
        <MergeAccountModal
          isOpen={isMergeOpen}
          onClose={() => setIsMergeOpen(false)}
          sourceAccounts={[account]}
          availableAccounts={availableAccounts}
          isLoading={isFetchingAccounts}
        />
      )}

      {isDeleteOpen && (
        <Blade
          open={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          title="Delete Account"
          description="This action cannot be undone."
          icon={<Trash2 className="h-4 w-4" />}
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setIsDeleteOpen(false)}
                disabled={isDeleting}
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? (
                  "Deleting..."
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </>
                )}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {deleteError && (
              <Alert variant="danger">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </Alert>
            )}
            <Alert variant="warning">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Deleting &quot;{account.name}&quot; also deletes all of its transactions.</span>
            </Alert>
          </div>
        </Blade>
      )}
    </>
  );
}

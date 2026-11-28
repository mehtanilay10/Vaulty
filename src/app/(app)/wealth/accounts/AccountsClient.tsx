"use client";

import { useDeferredValue, useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AccountList } from "@/components/wealth/AccountList";

const AccountFormModal = dynamic(
  () => import("@/components/wealth/AccountFormModal").then((mod) => mod.AccountFormModal),
  { ssr: false },
);
const MergeAccountModal = dynamic(
  () => import("@/components/wealth/MergeAccountModal").then((mod) => mod.MergeAccountModal),
  { ssr: false },
);
const BulkDeleteAccountModal = dynamic(
  () =>
    import("@/components/wealth/BulkDeleteAccountModal").then((mod) => mod.BulkDeleteAccountModal),
  { ssr: false },
);
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton } from "@/components/ui/CommandBar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Plus, Search, X, Wallet, GitMerge, Trash2, CheckSquare, Square } from "lucide-react";
import { Tabs, Tab } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
import type { WealthAccountDTO } from "@/types";

interface AccountsClientProps {
  accounts: WealthAccountDTO[];
}

function getSearchText(account: WealthAccountDTO): string {
  return [
    account.name,
    account.provider,
    account.bankName,
    account.branchName,
    account.accountNumber,
    account.type.replace(/_/g, " "),
    account.category,
    account.currency,
    account.status,
    account.notes,
    account.broker,
    account.loanType,
    account.tags?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function AccountsClient({ accounts }: AccountsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [activeTypeTab, setActiveTypeTab] = useState<string>("ALL");

  // Merge-mode state
  const [mergeMode, setMergeMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const openAddAccount = () => setIsAddOpen(true);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsAddOpen(true);
    }
  }, [searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Compute counts per account type across all accounts
  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) {
      map.set(a.type, (map.get(a.type) || 0) + 1);
    }
    return map;
  }, [accounts]);

  // Only show tabs where count > 1
  const eligibleTypeTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string; count: number }> = [
      { id: "ALL", label: "All Accounts", count: accounts.length },
    ];
    for (const [type, count] of typeCounts.entries()) {
      if (count > 1) {
        const label = type
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase());
        tabs.push({ id: type, label, count });
      }
    }
    return tabs;
  }, [accounts, typeCounts]);

  const filteredAccounts = useMemo(() => {
    let result = accounts;
    if (activeTypeTab !== "ALL") {
      result = result.filter((a) => a.type === activeTypeTab);
    }
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    if (!normalizedQuery) return result;
    return result.filter((account) => getSearchText(account).includes(normalizedQuery));
  }, [accounts, activeTypeTab, deferredQuery]);

  const hasQuery = query.trim().length > 0;

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = () => {
    if (selectedIds.size === filteredAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
    }
  };

  const handleExitMergeMode = () => {
    setMergeMode(false);
    setSelectedIds(new Set());
  };

  const handleExitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedIds(new Set());
  };

  const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
  const allSelected = filteredAccounts.length > 0 && selectedIds.size === filteredAccounts.length;

  return (
    <>
      <div className="space-y-3">
        <PageHeader title="Wealth Accounts" icon={<Wallet className="h-5 w-5" />} />

        <CommandBar
          farItems={
            <div className="relative w-40 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter accounts..."
                className="h-7 w-full rounded-md border border-border-subtle bg-surface-muted/50 pl-8 pr-6 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          }
        >
          {mergeMode || deleteMode ? (
            <CommandBarButton
              icon={<X className="h-3.5 w-3.5" />}
              onClick={mergeMode ? handleExitMergeMode : handleExitDeleteMode}
            >
              Cancel {mergeMode ? "Merge" : "Delete"}
            </CommandBarButton>
          ) : (
            <>
              <CommandBarButton
                primary
                icon={<Plus className="h-3.5 w-3.5 text-white" />}
                onClick={openAddAccount}
              >
                Add account
              </CommandBarButton>
              {accounts.length >= 2 && (
                <CommandBarButton
                  icon={<GitMerge className="h-3.5 w-3.5" />}
                  onClick={() => setMergeMode(true)}
                >
                  Merge
                </CommandBarButton>
              )}
              {accounts.length >= 1 && (
                <CommandBarButton
                  danger
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setDeleteMode(true)}
                >
                  Delete
                </CommandBarButton>
              )}
            </>
          )}
        </CommandBar>
      </div>

      {/* Merge mode banner */}
      {mergeMode && (
        <div className="rounded-xl border border-brand/20 bg-brand-subtle/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <GitMerge className="h-4 w-4 shrink-0 text-brand" />
            <div>
              <p className="text-[13px] font-medium text-text-primary">Select accounts to merge</p>
              <p className="text-[12px] text-text-muted">
                {selectedIds.size === 0
                  ? "Click on accounts to select them. Then choose a master account to keep."
                  : `${selectedIds.size} account${selectedIds.size > 1 ? "s" : ""} selected — choose a master to merge into.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={handleSelectAll}>
              {allSelected ? (
                <>
                  <CheckSquare className="h-3.5 w-3.5" /> Deselect all
                </>
              ) : (
                <>
                  <Square className="h-3.5 w-3.5" /> Select all
                </>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => setIsMergeModalOpen(true)}
              disabled={selectedIds.size < 1}
            >
              <GitMerge className="h-3.5 w-3.5" />
              Merge {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </Button>
          </div>
        </div>
      )}

      {/* Delete mode banner */}
      {deleteMode && (
        <div className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Trash2 className="h-4 w-4 shrink-0 text-danger" />
            <div>
              <p className="text-[13px] font-medium text-text-primary">Select accounts to delete</p>
              <p className="text-[12px] text-text-muted">
                {selectedIds.size === 0
                  ? "Click on accounts to select them for deletion."
                  : `${selectedIds.size} account${selectedIds.size > 1 ? "s" : ""} selected — confirm deletion to proceed.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={handleSelectAll}>
              {allSelected ? (
                <>
                  <CheckSquare className="h-3.5 w-3.5" /> Deselect all
                </>
              ) : (
                <>
                  <Square className="h-3.5 w-3.5" /> Select all
                </>
              )}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsDeleteModalOpen(true)}
              disabled={selectedIds.size < 1}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </Button>
          </div>
        </div>
      )}

      {eligibleTypeTabs.length > 1 && (
        <Tabs className="mb-1">
          {eligibleTypeTabs.map((tab) => (
            <Tab
              key={tab.id}
              value={tab.id}
              active={activeTypeTab === tab.id}
              onClick={() => setActiveTypeTab(tab.id)}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  activeTypeTab === tab.id
                    ? "bg-brand/15 text-brand"
                    : "bg-surface-muted text-text-muted",
                )}
              >
                {tab.count}
              </span>
            </Tab>
          ))}
        </Tabs>
      )}

      <div className="toolbar-surface p-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, provider, type, tag, or status..."
              aria-label="Search wealth accounts"
              className="w-full pl-9 pr-10"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear account search"
                className="absolute right-2 top-1/2 rounded p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
            Showing {filteredAccounts.length} of {accounts.length}{" "}
            {accounts.length === 1 ? "account" : "accounts"}
            {hasQuery ? ` matching "${query.trim()}"` : ""}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeader
          icon={<Wallet className="h-4 w-4" />}
          title="All accounts"
          description={
            mergeMode
              ? "Click accounts to select them for merging."
              : deleteMode
                ? "Click accounts to select them for deletion."
                : "Open an account to review balances and transactions."
          }
          count={filteredAccounts.length}
        />

        {filteredAccounts.length > 0 ? (
          <AccountList
            accounts={filteredAccounts}
            onAdd={openAddAccount}
            selectable={mergeMode || deleteMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        ) : hasQuery ? (
          <div className="card p-0">
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No matching accounts"
              description="Try a different name, provider, account type, tag, or status."
              action={
                <Button variant="secondary" onClick={() => setQuery("")}>
                  <X className="h-4 w-4" />
                  Clear search
                </Button>
              }
            />
          </div>
        ) : (
          <AccountList accounts={accounts} onAdd={openAddAccount} />
        )}
      </section>

      {isAddOpen && (
        <AccountFormModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {isMergeModalOpen && selectedAccounts.length > 0 && (
        <MergeAccountModal
          isOpen={isMergeModalOpen}
          onClose={() => setIsMergeModalOpen(false)}
          sourceAccounts={selectedAccounts}
          availableAccounts={accounts}
          onMerged={(targetId) => {
            setIsMergeModalOpen(false);
            handleExitMergeMode();
            router.push(`/wealth/accounts/${targetId}`);
            router.refresh();
          }}
        />
      )}

      {isDeleteModalOpen && selectedAccounts.length > 0 && (
        <BulkDeleteAccountModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          accounts={selectedAccounts}
          onDeleted={() => {
            setIsDeleteModalOpen(false);
            handleExitDeleteMode();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

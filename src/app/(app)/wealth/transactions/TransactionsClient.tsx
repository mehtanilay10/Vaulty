"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton, CommandBarDivider } from "@/components/ui/CommandBar";
import { TransactionList } from "@/components/wealth/TransactionList";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowLeft, Receipt, Search, X } from "lucide-react";
import type { WealthTransactionDTO } from "@/types";

interface TransactionsClientProps {
  transactions: WealthTransactionDTO[];
}

export function TransactionsClient({ transactions }: TransactionsClientProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedAccountId, setSelectedAccountId] = useState("ALL");
  const [selectedType, setSelectedType] = useState("ALL");

  const accounts = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of transactions) {
      if (t.accountId && t.account?.name) {
        map.set(t.accountId, t.account.name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();

    return transactions.filter((t) => {
      if (selectedAccountId !== "ALL" && t.accountId !== selectedAccountId) {
        return false;
      }

      if (selectedType !== "ALL") {
        if (selectedType === "DEPOSITS" && t.type !== "DEPOSIT" && t.type !== "TRANSFER_IN") {
          return false;
        }
        if (
          selectedType === "WITHDRAWALS" &&
          t.type !== "WITHDRAWAL" &&
          t.type !== "PURCHASE" &&
          t.type !== "TRANSFER_OUT" &&
          t.type !== "PAYMENT"
        ) {
          return false;
        }
        if (selectedType === "TRANSFERS" && t.type !== "TRANSFER_IN" && t.type !== "TRANSFER_OUT") {
          return false;
        }
        if (selectedType === t.type) {
          // Exact match (e.g. PAYMENT, FEE, INTEREST)
        } else if (
          selectedType !== "DEPOSITS" &&
          selectedType !== "WITHDRAWALS" &&
          selectedType !== "TRANSFERS"
        ) {
          return false;
        }
      }

      if (q) {
        const text = [
          t.description,
          t.category,
          t.subcategory,
          t.referenceNumber,
          t.account?.name,
          t.type.replace(/_/g, " "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!text.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, deferredQuery, selectedAccountId, selectedType]);

  const hasFilters =
    query.trim().length > 0 || selectedAccountId !== "ALL" || selectedType !== "ALL";

  const clearFilters = () => {
    setQuery("");
    setSelectedAccountId("ALL");
    setSelectedType("ALL");
  };

  return (
    <>
      <div className="space-y-3">
        <PageHeader title="Wealth Transactions" icon={<Receipt className="h-5 w-5" />} />

        <CommandBar
          farItems={
            <span className="text-xs text-text-muted px-2">
              {filteredTransactions.length} transaction
              {filteredTransactions.length === 1 ? "" : "s"}
            </span>
          }
        >
          <CommandBarButton
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
            item={{ key: "back", label: "Back to wealth", href: "/wealth" }}
          />
          {hasFilters && (
            <>
              <CommandBarDivider />
              <CommandBarButton icon={<X className="h-3.5 w-3.5" />} onClick={clearFilters}>
                Clear filters
              </CommandBarButton>
            </>
          )}
        </CommandBar>
      </div>

      <div className="toolbar-surface p-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 sm:items-center">
          <div className="relative sm:col-span-6">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by description, reference, or category..."
              aria-label="Search transactions"
              className="w-full pl-9 pr-10"
            />
            {query.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 rounded p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {accounts.length > 1 && (
            <div className="sm:col-span-3">
              <Select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                aria-label="Filter by account"
                className="w-full"
              >
                <option value="ALL">All accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className={accounts.length > 1 ? "sm:col-span-3" : "sm:col-span-6"}>
            <Select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              aria-label="Filter by transaction type"
              className="w-full"
            >
              <option value="ALL">All types</option>
              <option value="DEPOSITS">Deposits / Credits</option>
              <option value="WITHDRAWALS">Withdrawals / Debits</option>
              <option value="TRANSFERS">Transfers</option>
              <option value="PAYMENT">Payments</option>
              <option value="INTEREST">Interest</option>
              <option value="FEE">Fees</option>
            </Select>
          </div>
        </div>

        {hasFilters && (
          <div className="mt-2.5 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11px] text-text-muted">
            <p className="font-mono tabular-nums">
              Showing {filteredTransactions.length} of {transactions.length} transactions
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-brand hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      <section className="space-y-3">
        <SectionHeader
          icon={<Receipt className="h-4 w-4" />}
          title="Transactions"
          description="A combined ledger across your portfolio."
          count={filteredTransactions.length}
        />

        {filteredTransactions.length > 0 ? (
          <TransactionList transactions={filteredTransactions} showAccount />
        ) : hasFilters ? (
          <div className="card p-0">
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No matching transactions"
              description="No transactions match your search query and filters."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  <X className="h-4 w-4" />
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <TransactionList transactions={[]} showAccount />
        )}
      </section>
    </>
  );
}

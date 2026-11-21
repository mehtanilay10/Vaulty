"use client";

import { AccountCard } from "./AccountCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Plus, Wallet } from "lucide-react";
import type { WealthAccountDTO } from "@/types";

interface AccountListProps {
  accounts: WealthAccountDTO[];
  onAdd?: () => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function AccountList({
  accounts,
  onAdd,
  selectable,
  selectedIds,
  onToggleSelect,
}: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <div className="card p-8">
        <EmptyState
          icon={<Wallet className="w-10 h-10" />}
          title="No wealth accounts yet"
          description="Add your savings accounts, credit cards, investments, and more to track your net worth."
          action={
            onAdd ? (
              <Button onClick={onAdd}>
                <Plus className="w-4 h-4" />
                Add Account
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          selectable={selectable}
          selected={selectedIds?.has(account.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

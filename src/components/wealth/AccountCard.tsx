"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, isLiabilityType } from "@/lib/wealth";
import type { WealthAccountDTO } from "@/types";
import {
  Wallet,
  CreditCard,
  TrendingUp,
  Home,
  Briefcase,
  Gift,
  Landmark,
  Building2,
  ChevronRight,
  Check,
  type LucideIcon,
} from "lucide-react";

interface AccountCardProps {
  account: WealthAccountDTO;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const accountIcons: Record<string, LucideIcon> = {
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

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  ACTIVE: "success",
  INACTIVE: "warning",
  CLOSED: "default",
  FROZEN: "danger",
};

export function AccountCard({ account, selectable, selected, onToggleSelect }: AccountCardProps) {
  const Icon = accountIcons[account.type] || Building2;
  const statusVariant = statusVariants[account.status] || "warning";
  const liability = isLiabilityType(account.type);

  const cardContent = (
    <>
      <div className="mb-3.5 flex items-start justify-between gap-2">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
            liability
              ? "border-danger/25 bg-danger-subtle/70 text-danger"
              : "border-success/25 bg-success-subtle/70 text-success"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        {selectable ? (
          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
              selected ? "border-brand bg-brand text-white" : "border-border-strong bg-surface"
            }`}
          >
            {selected && <Check className="h-3 w-3" />}
          </div>
        ) : (
          <Badge variant={statusVariant}>{account.status}</Badge>
        )}
      </div>

      <p className="mb-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {account.provider || account.bankName || account.type.replace(/_/g, " ")}
      </p>
      <h3 className="mb-2 truncate text-[14px] font-semibold tracking-tight text-text-primary group-hover:text-brand">
        {account.name}
      </h3>
      {account.category && (
        <div className="mb-2">
          <Badge variant="default">{account.category}</Badge>
        </div>
      )}

      <div className="mt-auto border-t border-border-subtle pt-3">
        <p
          className={`font-mono text-lg font-bold tracking-tight tabular-nums leading-6 ${
            liability ? "text-danger" : "text-text-primary"
          }`}
        >
          {formatCurrency(account.currentBalance, account.currency)}
        </p>
        <div className="mt-1 flex items-center justify-between font-mono text-[11px] tabular-nums text-text-muted">
          <span>{account._count?.transactions || 0} transactions</span>
          {!selectable && (
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </div>
      </div>
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(account.id)}
        className={`group flex flex-col rounded-xl border bg-surface p-4 text-left shadow-xs transition-all ${
          selected
            ? "border-brand ring-2 ring-brand/25"
            : "border-border-subtle hover:border-border-strong hover:bg-surface-elevated"
        }`}
      >
        {cardContent}
      </button>
    );
  }

  return (
    <Link
      href={`/wealth/accounts/${account.id}`}
      className="group flex flex-col rounded-xl border border-border-subtle bg-surface p-4 shadow-xs transition-all hover:border-border-strong hover:bg-surface-elevated hover:shadow-sm"
    >
      {cardContent}
    </Link>
  );
}

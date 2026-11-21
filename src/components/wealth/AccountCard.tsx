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
      <div className="mb-3 flex items-start justify-between gap-2">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
            liability
              ? "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        {selectable ? (
          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
              selected ? "border-primary bg-primary text-white" : "border-border bg-surface"
            }`}
          >
            {selected && <Check className="h-3 w-3" />}
          </div>
        ) : (
          <Badge variant={statusVariant}>{account.status}</Badge>
        )}
      </div>

      <h3 className="mb-1 truncate text-[13px] font-semibold text-text-primary">{account.name}</h3>
      <p className="mb-2 truncate text-[11px] text-text-muted">
        {account.provider || account.bankName || account.type.replace(/_/g, " ")}
      </p>
      {account.category && (
        <div className="mb-1">
          <Badge variant="default">{account.category}</Badge>
        </div>
      )}

      <div className="mt-auto border-t border-border-subtle pt-2.5">
        <p
          className={`text-lg font-semibold leading-6 ${
            liability ? "text-danger" : "text-text-primary"
          }`}
        >
          {formatCurrency(account.currentBalance, account.currency)}
        </p>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-text-muted">
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
        className={`card flex flex-col p-4 text-left transition-all ${
          selected ? "ring-2 ring-primary ring-offset-1" : "hover:ring-1 hover:ring-border"
        }`}
      >
        {cardContent}
      </button>
    );
  }

  return (
    <Link
      href={`/wealth/accounts/${account.id}`}
      className="card card-hover group flex flex-col p-4"
    >
      {cardContent}
    </Link>
  );
}

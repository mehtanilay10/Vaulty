"use client";

import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/wealth";
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from "lucide-react";

interface WealthSummaryCardProps {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  accountCount: number;
  currency?: string;
}

export function WealthSummaryCard({
  totalAssets,
  totalLiabilities,
  netWorth,
  accountCount,
  currency = "INR",
}: WealthSummaryCardProps) {
  const format = (amount: number) => formatCurrency(amount, currency);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total assets"
        value={<span className="text-[1.4rem]">{format(totalAssets)}</span>}
        icon={<TrendingUp className="h-4 w-4" />}
        tone="success"
        hint={currency}
      />
      <StatCard
        label="Total liabilities"
        value={<span className="text-[1.4rem]">{format(totalLiabilities)}</span>}
        icon={<TrendingDown className="h-4 w-4" />}
        tone="danger"
        hint={currency}
      />
      <StatCard
        label="Net worth"
        value={<span className="text-[1.4rem]">{format(netWorth)}</span>}
        icon={<Wallet className="h-4 w-4" />}
        tone="brand"
        hint={currency}
      />
      <StatCard
        label="Accounts tracked"
        value={accountCount}
        icon={<PiggyBank className="h-4 w-4" />}
        tone="warning"
        hint="Portfolio"
      />
    </div>
  );
}

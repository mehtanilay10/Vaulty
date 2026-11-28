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
  const grossVolume = Math.max(totalAssets + totalLiabilities, 0);
  const assetRatio = grossVolume > 0 ? Math.round((totalAssets / grossVolume) * 100) : 100;

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total assets"
          value={<span className="text-[1.45rem] tabular-nums">{format(totalAssets)}</span>}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
          hint={currency}
        />
        <StatCard
          label="Total liabilities"
          value={<span className="text-[1.45rem] tabular-nums">{format(totalLiabilities)}</span>}
          icon={<TrendingDown className="h-4 w-4" />}
          tone="danger"
          hint={currency}
        />
        <StatCard
          label="Net worth"
          value={<span className="text-[1.45rem] tabular-nums">{format(netWorth)}</span>}
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

      {grossVolume > 0 && (
        <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3 shadow-xs">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="font-mono uppercase tracking-wider text-text-muted">
              Balance sheet ratio
            </span>
            <span className="font-mono tabular-nums text-text-secondary">
              {assetRatio}% assets · {100 - assetRatio}% liabilities
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="bg-success transition-all duration-300"
              style={{ width: `${assetRatio}%` }}
            />
            {100 - assetRatio > 0 && (
              <div
                className="bg-danger transition-all duration-300"
                style={{ width: `${100 - assetRatio}%` }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

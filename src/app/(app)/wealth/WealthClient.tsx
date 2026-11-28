"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { WealthSummaryCard } from "@/components/wealth/WealthSummaryCard";
import { AccountList } from "@/components/wealth/AccountList";
import { WealthBreakdownChart } from "@/components/wealth/WealthBreakdownChart";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton, CommandBarDivider } from "@/components/ui/CommandBar";
import { cn } from "@/lib/utils";

const AccountFormModal = dynamic(
  () => import("@/components/wealth/AccountFormModal").then((mod) => mod.AccountFormModal),
  { ssr: false },
);
const StatementImportClient = dynamic(
  () =>
    import("@/app/(app)/wealth/statements/import/StatementImportClient").then(
      (mod) => mod.StatementImportClient,
    ),
  { ssr: false },
);
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Modal } from "@/components/ui/Modal";
import { Plus, ChevronRight, Wallet, PieChart, Upload, Mail } from "lucide-react";
import type { WealthAccountDTO } from "@/types";
import Link from "next/link";

interface WealthClientProps {
  summary: {
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    accountCount: number;
    currency?: string | null;
    currencyTotals: Array<{
      currency: string;
      totalAssets: number;
      totalLiabilities: number;
      netWorth: number;
      accountCount: number;
      byType: Array<{ type: string; amount: number; percentage: number }>;
      liabilityByType: Array<{ type: string; amount: number; percentage: number }>;
      byCategory: Array<{ category: string; amount: number; percentage: number }>;
    }>;
  };
  breakdown: {
    byType: Array<{ type: string; amount: number; percentage: number }>;
    liabilityByType: Array<{ type: string; amount: number; percentage: number }>;
    byCategory: Array<{ category: string; amount: number; percentage: number }>;
  };
  accounts: WealthAccountDTO[];
}

export function WealthClient({ summary, breakdown, accounts }: WealthClientProps) {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Filter out USD as requested ("on wealth usd should not be visible")
  const visibleTotals = (summary.currencyTotals || []).filter((t) => t.currency !== "USD");
  const defaultCurrency =
    visibleTotals.find((t) => t.currency === "INR")?.currency ||
    visibleTotals[0]?.currency ||
    summary.currency ||
    "INR";

  const [selectedCurrency, setSelectedCurrency] = useState<string>(defaultCurrency);

  const activeTotal =
    visibleTotals.find((t) => t.currency === selectedCurrency) ||
    visibleTotals[0] ||
    summary.currencyTotals?.[0];

  const totalAssets = activeTotal?.totalAssets ?? summary.totalAssets;
  const totalLiabilities = activeTotal?.totalLiabilities ?? summary.totalLiabilities;
  const netWorth = activeTotal?.netWorth ?? summary.netWorth;
  const accountCount = activeTotal?.accountCount ?? summary.accountCount;
  const assetBreakdown = activeTotal?.byType?.length ? activeTotal.byType : breakdown.byType;
  const liabilityBreakdown = activeTotal?.liabilityByType?.length
    ? activeTotal.liabilityByType
    : breakdown.liabilityByType;
  const currentCurrency = activeTotal?.currency || selectedCurrency;

  const openAddAccount = () => setIsAddOpen(true);
  const handleSaved = () => router.refresh();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <PageHeader title="Wealth Management" icon={<Wallet className="h-5 w-5" />} />

        <CommandBar
          farItems={
            visibleTotals.length > 1 ? (
              <div className="flex items-center gap-1 rounded-md border border-border-subtle bg-surface-muted/60 p-0.5">
                {visibleTotals.map((tot) => (
                  <button
                    key={tot.currency}
                    type="button"
                    onClick={() => setSelectedCurrency(tot.currency)}
                    className={cn(
                      "rounded px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors",
                      selectedCurrency === tot.currency
                        ? "bg-brand text-white font-semibold shadow-2xs"
                        : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    {tot.currency}
                    <span className="ml-1 opacity-75 text-[10px]">({tot.accountCount})</span>
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          <CommandBarButton
            primary
            icon={<Plus className="h-3.5 w-3.5 text-white" />}
            onClick={openAddAccount}
          >
            Add account
          </CommandBarButton>
          <CommandBarButton
            icon={<Upload className="h-3.5 w-3.5" />}
            onClick={() => setIsImportOpen(true)}
          >
            Import statement
          </CommandBarButton>
          <CommandBarDivider />
          <CommandBarButton
            icon={<Mail className="h-3.5 w-3.5" />}
            item={{ key: "email-sync", label: "Sync email", href: "/email-sync" }}
          />
        </CommandBar>
      </div>

      <WealthSummaryCard
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        netWorth={netWorth}
        accountCount={accountCount}
        currency={currentCurrency}
      />

      <section className="space-y-3">
        <SectionHeader
          icon={<PieChart className="h-4 w-4" />}
          title="Portfolio breakdown"
          description="How your assets and liabilities are distributed by account type."
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <WealthBreakdownChart
            title="Assets"
            items={assetBreakdown}
            currency={currentCurrency}
            emptyMessage="Add an asset account to see your asset breakdown."
          />
          <WealthBreakdownChart
            title="Liabilities"
            tone="liability"
            items={liabilityBreakdown}
            currency={currentCurrency}
            emptyMessage="Add a credit card or loan to see your liability breakdown."
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          icon={<Wallet className="h-4 w-4" />}
          title="Your accounts"
          description="A snapshot of the accounts contributing to your net worth."
          count={accounts.length}
          action={
            <Link
              href="/wealth/accounts"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              View all accounts
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <AccountList accounts={accounts.slice(0, 4)} onAdd={openAddAccount} />
      </section>

      {isAddOpen && (
        <AccountFormModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {isImportOpen && (
        <Modal
          open={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          title="Import Bank Statement"
        >
          <StatementImportClient accounts={accounts} />
        </Modal>
      )}
    </div>
  );
}

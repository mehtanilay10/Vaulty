"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { WealthSummaryCard } from "@/components/wealth/WealthSummaryCard";
import { AccountList } from "@/components/wealth/AccountList";
import { WealthBreakdownChart } from "@/components/wealth/WealthBreakdownChart";
import { PageHeader } from "@/components/shell/PageHeader";

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
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Modal } from "@/components/ui/Modal";
import { Plus, ChevronRight, Wallet, PieChart, Upload, Mail } from "lucide-react";
import { Tabs, Tab } from "@/components/ui/Tabs";
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
    <>
      <PageHeader
        eyebrow="Financial overview"
        title="Wealth Management"
        description="Track your savings, investments, loans, and net worth."
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <>
            <Button onClick={openAddAccount}>
              <Plus className="h-4 w-4" />
              Add account
            </Button>
            <Button variant="secondary" onClick={() => setIsImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import statement
            </Button>
            <Link href="/email-sync">
              <Button variant="secondary">
                <Mail className="h-4 w-4" />
                Sync email
              </Button>
            </Link>
          </>
        }
      />

      {visibleTotals.length > 1 && (
        <div className="mb-3">
          <Tabs>
            {visibleTotals.map((tot) => (
              <Tab
                key={tot.currency}
                value={tot.currency}
                active={selectedCurrency === tot.currency}
                onClick={() => setSelectedCurrency(tot.currency)}
              >
                <span>{tot.currency}</span>
                <span className="ml-1 text-[10px] text-text-muted font-normal">
                  ({tot.accountCount})
                </span>
              </Tab>
            ))}
          </Tabs>
        </div>
      )}

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
    </>
  );
}

"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useUpload } from "@/app/contexts/UploadContext";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";
import { cn } from "@/lib/utils";
import { formatCurrency, isLiabilityType } from "@/lib/wealth";
import type { User } from "@/types";
import {
  AlertTriangle,
  BellRing,
  ArrowRight,
  CheckCircle2,
  CalendarClock,
  ChevronRight,
  CreditCard,
  FileText,
  Folder,
  Globe,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Upload,
  Users,
  Wallet,
} from "lucide-react";

interface WealthPreviewAccount {
  id: string;
  name: string;
  type: string;
  status: string;
  currentBalance: number | string;
  currency: string;
}

interface DashboardReminder {
  id: string;
  title: string;
  category: string;
  dueAt: string;
  recurrence: string;
}

interface WealthReminder {
  accountId: string;
  accountName: string;
  type: string;
  reminderType: string;
  dueDate: string | number | null;
}

interface ExpiringDocument {
  id: string;
  name: string;
  expiryDate: string | null;
  folder: { id: string; name: string } | null;
}

export interface DashboardRecentDocument {
  id: string;
  name: string;
  createdAt: string | Date;
  folder?: { id: string; name: string } | null;
}

export interface DashboardOverviewProps {
  user: User;
  customReminders: DashboardReminder[];
  documents: {
    total: number;
    folders: number;
    aiSummaries: number;
    recent: DashboardRecentDocument[];
    expiring: ExpiringDocument[];
  };
  credentials: {
    hasVault: boolean;
    appCount: number;
    bankCount: number;
    favoriteCount: number;
    sharedCount: number;
  };
  wealth: {
    summary: {
      totalAssets: number;
      totalLiabilities: number;
      netWorth: number;
      accountCount: number;
      currency: string | null;
      currencyTotals: Array<{
        currency: string;
        totalAssets: number;
        totalLiabilities: number;
        netWorth: number;
        accountCount: number;
      }>;
    };
    accounts: WealthPreviewAccount[];
    reminders: WealthReminder[];
  };
  initialDriveConnected?: boolean;
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "brand" | "success" | "danger" | "violet" | "emerald" | "amber";
}) {
  const toneClass = {
    default: "text-text-primary",
    brand: "text-brand",
    success: "text-success",
    danger: "text-danger",
    violet: "text-purple-600 dark:text-purple-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
  }[tone];

  return (
    <div className="min-w-0 rounded-lg border border-border-subtle bg-surface-muted/60 px-2.5 py-2">
      <p
        className={cn("truncate text-[13px] font-semibold leading-5 tabular-nums", toneClass)}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </p>
      <p className="truncate text-[11px] font-medium text-text-muted" title={label}>
        {label}
      </p>
    </div>
  );
}

const domainTones = {
  brand: {
    tile: "border-brand/20 bg-brand-subtle text-brand",
    linkHover: "hover:border-brand/30 hover:text-brand",
  },
  violet: {
    tile: "border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400",
    linkHover: "hover:border-purple-500/30 hover:text-purple-600 dark:hover:text-purple-400",
  },
  emerald: {
    tile: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    linkHover: "hover:border-emerald-500/30 hover:text-emerald-600 dark:hover:text-emerald-400",
  },
  amber: {
    tile: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    linkHover: "hover:border-amber-500/30 hover:text-amber-600 dark:hover:text-amber-400",
  },
  rose: {
    tile: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    linkHover: "hover:border-rose-500/30 hover:text-rose-600 dark:hover:text-rose-400",
  },
  sky: {
    tile: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    linkHover: "hover:border-sky-500/30 hover:text-sky-600 dark:hover:text-sky-400",
  },
} as const;

function DomainCard({
  icon,
  title,
  description,
  href,
  linkLabel,
  tone = "brand",
  children,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  tone?: keyof typeof domainTones;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const style = domainTones[tone];

  return (
    <section className="card flex flex-col overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle bg-surface-muted/40 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
              style.tile,
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-text-primary tracking-tight">
              {title}
            </h2>
            <p className="truncate text-[11px] text-text-muted">{description}</p>
          </div>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
        >
          View
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex-1">{children}</div>
        <Link
          href={href}
          className={cn(
            "mt-4 inline-flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-muted/60 px-3 py-2 text-[12px] font-semibold text-text-secondary transition-colors",
            style.linkHover,
          )}
        >
          {footer ?? linkLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function EmptyHint({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-md border border-border-subtle bg-surface-muted/40 px-4 py-6 text-center">
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted text-text-muted">
        {icon}
      </span>
      <p className="text-[12px] font-semibold text-text-primary">{title}</p>
      <p className="mt-0.5 max-w-[16rem] text-[11px] leading-relaxed text-text-muted">
        {description}
      </p>
    </div>
  );
}

function getUrgency(expiryDate: string | null) {
  if (!expiryDate) return { label: "Unknown", variant: "default" as const };
  const diffDays = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: "Expired", variant: "danger" as const };
  if (diffDays <= 14) return { label: `${diffDays}d left`, variant: "danger" as const };
  if (diffDays <= 30) return { label: `${diffDays}d left`, variant: "warning" as const };
  return { label: `${diffDays}d left`, variant: "success" as const };
}

function getReminderLabel(reminder: WealthReminder) {
  if (reminder.reminderType === "PAYMENT_DUE") {
    return typeof reminder.dueDate === "number"
      ? `Payment due on day ${reminder.dueDate}`
      : "Payment due soon";
  }

  if (typeof reminder.dueDate === "string") {
    return `Expires ${new Date(reminder.dueDate).toLocaleDateString()}`;
  }

  return "Expires soon";
}

export function DashboardOverviewClient({
  user,
  customReminders,
  documents,
  credentials,
  wealth,
  initialDriveConnected = false,
}: DashboardOverviewProps) {
  const { openUpload } = useUpload();
  const { isConnected: liveIsConnected } = useGoogleDriveStatus();
  const isConnected = liveIsConnected || initialDriveConnected;

  const credentialCount = credentials.appCount + credentials.bankCount;
  const hasAttention =
    documents.expiring.length > 0 || wealth.reminders.length > 0 || customReminders.length > 0;

  const rawFirstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "User";
  const capitalizedFirstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1);

  return (
    <>
      <PageHeader
        eyebrow="Vault overview"
        title={`Welcome back, ${capitalizedFirstName}`}
        description="Documents, credentials, and wealth — your private vault at a glance."
        actions={
          <>
            <Link
              href="/chat"
              className="btn btn-secondary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
            >
              <MessageSquare className="h-4 w-4" />
              Ask AI
            </Link>
            <Button onClick={openUpload} disabled={!isConnected}>
              <Upload className="h-4 w-4" />
              Upload document
            </Button>
          </>
        }
      />

      {(!credentials.hasVault ||
        !isConnected ||
        documents.total === 0 ||
        wealth.summary.accountCount === 0) && (
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                Getting started
              </p>
              <h2 className="mt-1 text-base font-semibold text-text-primary">
                Set up your personal vault
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Complete these steps to get the most out of Vaulty.
              </p>
            </div>
            <Badge variant="info">Setup checklist</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Connect Google Drive",
                done: isConnected,
                href: "/settings",
                detail: "Choose where documents are stored",
              },
              {
                label: "Upload a document",
                done: documents.total > 0,
                href: "/documents",
                detail: "Add a policy, report or certificate",
              },
              {
                label: "Set up credentials",
                done: credentials.hasVault,
                href: "/credentials",
                detail: "Create your encrypted password vault",
              },
              {
                label: "Add a wealth account",
                done: wealth.summary.accountCount > 0,
                href: "/wealth/accounts",
                detail: "Start tracking your finances",
              },
            ].map((task) => (
              <Link
                key={task.label}
                href={task.href}
                className="flex items-start gap-3 rounded-xl bg-surface-muted/70 p-3 transition-colors hover:bg-surface-muted"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${task.done ? "bg-success-subtle text-success" : "bg-surface text-text-muted"}`}
                >
                  {task.done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="text-xs">•</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">
                    {task.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    {task.done ? "Completed" : task.detail}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DomainCard
          tone="brand"
          icon={<FileText className="h-5 w-5" />}
          title="Documents"
          description="Private files and AI summaries"
          href="/documents"
          linkLabel="Open document vault"
        >
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Documents" value={documents.total} tone="brand" />
            <MiniStat label="Folders" value={documents.folders} />
            <MiniStat label="AI ready" value={documents.aiSummaries} tone="success" />
          </div>

          <div className="mt-4 space-y-1.5">
            {documents.recent.length === 0 ? (
              <EmptyHint
                icon={<FileText className="h-4 w-4" />}
                title="No documents yet"
                description="Upload your first document to start building your private vault."
              />
            ) : (
              documents.recent.slice(0, 3).map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-brand/15 bg-brand-subtle text-brand">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-text-primary">
                      {doc.name}
                    </p>
                    <p className="truncate text-[10px] text-text-muted">
                      {doc.folder?.name || "Unfiled"} ·{" "}
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))
            )}
          </div>
        </DomainCard>

        <DomainCard
          tone="violet"
          icon={<Lock className="h-5 w-5" />}
          title="Credentials"
          description="Encrypted app and bank logins"
          href="/credentials"
          linkLabel={credentials.hasVault ? "Open credential vault" : "Set up credential vault"}
        >
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Apps" value={credentials.appCount} tone="violet" />
            <MiniStat label="Banks" value={credentials.bankCount} />
            <MiniStat label="Favorites" value={credentials.favoriteCount} tone="amber" />
          </div>

          <div className="mt-4 space-y-1.5">
            {!credentials.hasVault ? (
              <EmptyHint
                icon={<Lock className="h-4 w-4" />}
                title="No credential vault"
                description="Create an encrypted vault for your app and bank logins."
              />
            ) : (
              <>
                <div className="flex items-center gap-2.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-text-primary">
                      {credentialCount} credentials secured
                    </p>
                    <p className="truncate text-[10px] text-text-muted">Encrypted on your device</p>
                  </div>
                  <Badge variant="violet">Protected</Badge>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                  <Star className="h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-text-primary">
                      {credentials.favoriteCount} favorites
                    </p>
                    <p className="truncate text-[10px] text-text-muted">Quick access logins</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                  <Users className="h-4 w-4 shrink-0 text-text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-text-primary">
                      {credentials.sharedCount} shared with you
                    </p>
                    <p className="truncate text-[10px] text-text-muted">Family vault access</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </DomainCard>

        <DomainCard
          tone="emerald"
          icon={<Wallet className="h-5 w-5" />}
          title="Wealth"
          description="Accounts, balances, and net worth"
          href="/wealth"
          linkLabel="Open wealth dashboard"
        >
          {(() => {
            const nonUsdTotals = wealth.summary.currencyTotals.filter(
              (total) => total.currency !== "USD",
            );
            const single = nonUsdTotals.length === 1 ? nonUsdTotals[0] : null;
            const netWorth = single
              ? single.netWorth
              : wealth.summary.currency === "USD"
                ? 0
                : wealth.summary.netWorth;
            const totalAssets = single
              ? single.totalAssets
              : wealth.summary.currency === "USD"
                ? 0
                : wealth.summary.totalAssets;
            const totalLiabilities = single
              ? single.totalLiabilities
              : wealth.summary.currency === "USD"
                ? 0
                : wealth.summary.totalLiabilities;
            const currency = single
              ? single.currency
              : wealth.summary.currency === "USD"
                ? "INR"
                : wealth.summary.currency || "INR";

            if (nonUsdTotals.length > 1) {
              return (
                <div className="space-y-2">
                  {nonUsdTotals.map((total) => (
                    <div
                      key={total.currency}
                      className="rounded-md border border-border-subtle bg-surface-muted/60 px-3 py-2.5"
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        Net worth · {total.currency}
                      </p>
                      <p className="truncate text-[18px] font-semibold leading-7 tabular-nums text-brand">
                        {formatCurrency(total.netWorth, total.currency)}
                      </p>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <MiniStat
                          label="Assets"
                          value={formatCurrency(total.totalAssets, total.currency)}
                          tone="success"
                        />
                        <MiniStat
                          label="Liabilities"
                          value={formatCurrency(total.totalLiabilities, total.currency)}
                          tone="danger"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            return (
              <>
                <div className="rounded-md border border-border-subtle bg-surface-muted/60 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Net worth
                  </p>
                  <p className="truncate text-[20px] font-semibold leading-7 tabular-nums text-brand">
                    {formatCurrency(netWorth, currency)}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniStat
                    label="Assets"
                    value={formatCurrency(totalAssets, currency)}
                    tone="success"
                  />
                  <MiniStat
                    label="Liabilities"
                    value={formatCurrency(totalLiabilities, currency)}
                    tone="danger"
                  />
                </div>
              </>
            );
          })()}

          <div className="mt-4 space-y-1.5">
            {wealth.accounts.length === 0 ? (
              <EmptyHint
                icon={<Wallet className="h-4 w-4" />}
                title="No accounts tracked"
                description="Add your savings, investments, cards, or loans to see your net worth."
              />
            ) : (
              wealth.accounts.slice(0, 3).map((account) => {
                const liability = isLiabilityType(account.type);
                return (
                  <Link
                    key={account.id}
                    href={`/wealth/accounts/${account.id}`}
                    className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                        liability
                          ? "border-danger/20 bg-danger-subtle text-danger"
                          : "border-brand/15 bg-brand-subtle text-brand",
                      )}
                    >
                      {liability ? (
                        <CreditCard className="h-3.5 w-3.5" />
                      ) : (
                        <Wallet className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-text-primary">
                        {account.name}
                      </p>
                      <p className="truncate text-[10px] capitalize text-text-muted">
                        {account.type.replace(/_/g, " ").toLowerCase()}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-semibold",
                        liability ? "text-danger" : "text-text-primary",
                      )}
                    >
                      {formatCurrency(account.currentBalance, account.currency)}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </DomainCard>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-muted/50 p-4">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${isConnected ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">Storage & synchronization</p>
            <p className="text-xs text-text-muted">
              {isConnected
                ? "Google Drive is connected for document storage."
                : "Connect Google Drive to enable document storage and sync."}
            </p>
          </div>
          <Badge variant={isConnected ? "success" : "warning"}>
            {isConnected ? "Connected" : "Setup needed"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-muted/50 p-4">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${credentials.hasVault ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}
          >
            <Lock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">Credential security</p>
            <p className="text-xs text-text-muted">
              {credentials.hasVault
                ? "Your credential vault is configured with client-side encryption."
                : "Set up your encrypted credentials vault."}
            </p>
          </div>
          <Badge variant={credentials.hasVault ? "success" : "warning"}>
            {credentials.hasVault ? "Configured" : "Not set up"}
          </Badge>
        </div>
      </section>

      {!hasAttention && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-text-muted" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Stay ahead of important dates
              </p>
              <p className="text-xs text-text-muted">
                Create reminders for renewals, payments and personal milestones.
              </p>
            </div>
          </div>
          <Link href="/reminders" className="text-xs font-semibold text-brand hover:underline">
            Set a reminder <ArrowRight className="inline h-3 w-3" />
          </Link>
        </section>
      )}

      {hasAttention && (
        <section className="space-y-3">
          <SectionHeader
            icon={<AlertTriangle className="h-4 w-4 text-warning" />}
            title="Needs attention"
            description="Documents and financial items that are due soon."
            count={documents.expiring.length + wealth.reminders.length + customReminders.length}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {customReminders.length > 0 && (
              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-text-muted" />
                    <h3 className="text-[13px] font-semibold text-text-primary">Your reminders</h3>
                  </div>
                  <Link
                    href="/reminders"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                  >
                    Manage
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="divide-y divide-border-subtle">
                  {customReminders.map((reminder) => {
                    const days = Math.ceil(
                      (new Date(reminder.dueAt).setHours(0, 0, 0, 0) -
                        new Date().setHours(0, 0, 0, 0)) /
                        86400000,
                    );
                    return (
                      <Link
                        key={reminder.id}
                        href="/reminders"
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/70"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand">
                          <CalendarClock className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-text-primary">
                            {reminder.title}
                          </span>
                          <span className="block text-[10px] text-text-muted">
                            {new Date(reminder.dueAt).toLocaleDateString()}
                          </span>
                        </span>
                        <Badge variant={days < 0 ? "danger" : days <= 3 ? "warning" : "default"}>
                          {days < 0
                            ? `${Math.abs(days)}d overdue`
                            : days === 0
                              ? "Today"
                              : `${days}d left`}
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            )}
            {documents.expiring.length > 0 && (
              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-text-muted" />
                    <h3 className="text-[13px] font-semibold text-text-primary">
                      Expiring documents
                    </h3>
                  </div>
                  <Link
                    href="/documents"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                  >
                    View
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="divide-y divide-border-subtle">
                  {documents.expiring.map((doc) => {
                    const urgency = getUrgency(doc.expiryDate);
                    return (
                      <Link
                        key={doc.id}
                        href={`/documents/${doc.id}`}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/70"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-warning/20 bg-warning-subtle text-warning">
                          <CalendarClock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-text-primary">
                            {doc.name}
                          </p>
                          <p className="truncate text-[10px] text-text-muted">
                            {doc.folder?.name}
                            {doc.expiryDate
                              ? ` · Expires ${new Date(doc.expiryDate).toLocaleDateString()}`
                              : ""}
                          </p>
                        </div>
                        <Badge variant={urgency.variant}>{urgency.label}</Badge>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            )}

            {wealth.reminders.length > 0 && (
              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-text-muted" />
                    <h3 className="text-[13px] font-semibold text-text-primary">
                      Wealth reminders
                    </h3>
                  </div>
                  <Link
                    href="/wealth"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                  >
                    View
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="divide-y divide-border-subtle">
                  {wealth.reminders.map((reminder) => (
                    <Link
                      key={`${reminder.accountId}-${reminder.reminderType}`}
                      href={`/wealth/accounts/${reminder.accountId}`}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/70"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-info/20 bg-info-subtle text-info">
                        {reminder.type === "CREDIT_CARD" ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <Wallet className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-text-primary">
                          {reminder.accountName}
                        </p>
                        <p className="truncate text-[11px] text-text-muted">
                          {getReminderLabel(reminder)}
                        </p>
                      </div>
                      <Badge variant={reminder.reminderType === "PAYMENT_DUE" ? "warning" : "info"}>
                        {reminder.reminderType === "PAYMENT_DUE" ? "Payment due" : "Expiring"}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            href: "/documents/library",
            icon: Folder,
            label: "Browse all documents",
            hint: `${documents.total} files in your vault`,
          },
          {
            href: "/credentials",
            icon: Globe,
            label: "Manage credentials",
            hint: `${credentialCount} logins stored`,
          },
          {
            href: "/wealth/accounts",
            icon: TrendingUp,
            label: "Review accounts",
            hint: `${wealth.summary.accountCount} active accounts`,
          },
          {
            href: "/chat",
            icon: Sparkles,
            label: "Ask your vault",
            hint: "AI answers grounded in your documents",
          },
        ].map(({ href, icon: Icon, label, hint }) => (
          <Link
            key={href}
            href={href}
            className="card card-hover group flex items-center gap-3 p-4"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/15 bg-brand-subtle text-brand">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-text-primary">{label}</p>
              <p className="truncate text-[11px] text-text-muted">{hint}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </section>
    </>
  );
}

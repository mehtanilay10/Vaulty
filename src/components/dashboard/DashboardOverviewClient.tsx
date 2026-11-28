"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton, CommandBarDivider } from "@/components/ui/CommandBar";
import { Badge } from "@/components/ui/Badge";
import { useUpload } from "@/app/contexts/UploadContext";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";
import { cn } from "@/lib/utils";
import { formatCurrency, isLiabilityType } from "@/lib/wealth";
import type { User } from "@/types";
import {
  BellRing,
  ArrowRight,
  CheckCircle2,
  CalendarClock,
  ChevronRight,
  CreditCard,
  FileText,
  Lock,
  MessageSquare,
  ShieldCheck,
  Star,
  Upload,
  Users,
  Wallet,
  Camera,
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
    authenticatorCount?: number;
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
  const { openUpload, openCamera } = useUpload();
  const { isConnected: liveIsConnected } = useGoogleDriveStatus();
  const isConnected = liveIsConnected || initialDriveConnected;

  const credentialCount = credentials.appCount + credentials.bankCount;
  const authenticatorCount = credentials.authenticatorCount ?? 0;
  const attentionCount =
    customReminders.length + documents.expiring.length + wealth.reminders.length;

  const combinedAlerts = [
    ...documents.expiring.map((doc) => ({
      id: `doc-${doc.id}`,
      title: doc.name,
      sub: `${doc.folder?.name || "Unfiled"}${doc.expiryDate ? ` · Expires ${new Date(doc.expiryDate).toLocaleDateString()}` : ""}`,
      href: `/documents/${doc.id}`,
      badge: getUrgency(doc.expiryDate),
      sortTime: doc.expiryDate ? new Date(doc.expiryDate).getTime() : Number.MAX_SAFE_INTEGER,
    })),
    ...customReminders.map((reminder) => {
      const days = Math.ceil(
        (new Date(reminder.dueAt).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
          86400000,
      );
      return {
        id: `rem-${reminder.id}`,
        title: reminder.title,
        sub: new Date(reminder.dueAt).toLocaleDateString(),
        href: "/reminders",
        badge: {
          label: days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d left`,
          variant: (days < 0 ? "danger" : days <= 3 ? "warning" : "default") as
            "danger" | "warning" | "default",
        },
        sortTime: new Date(reminder.dueAt).getTime(),
      };
    }),
    ...wealth.reminders.map((reminder) => ({
      id: `wealth-${reminder.accountId}-${reminder.reminderType}`,
      title: reminder.accountName,
      sub: getReminderLabel(reminder),
      href: `/wealth/accounts/${reminder.accountId}`,
      badge: {
        label: reminder.reminderType === "PAYMENT_DUE" ? "Payment" : "Expiry",
        variant: "warning" as const,
      },
      sortTime:
        typeof reminder.dueDate === "string"
          ? new Date(reminder.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER - 1,
    })),
  ].sort((a, b) => a.sortTime - b.sortTime);

  const rawFirstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "User";
  const capitalizedFirstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1);

  const setupTasks = [
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
  ];
  const completedSetupCount = setupTasks.filter((t) => t.done).length;
  const needsSetup = completedSetupCount < setupTasks.length;

  const nonUsdTotals = wealth.summary.currencyTotals.filter((total) => total.currency !== "USD");
  const singleCurrencyTotal = nonUsdTotals.length === 1 ? nonUsdTotals[0] : null;
  const primaryNetWorth = singleCurrencyTotal
    ? singleCurrencyTotal.netWorth
    : wealth.summary.currency === "USD"
      ? 0
      : wealth.summary.netWorth;
  const primaryAssets = singleCurrencyTotal
    ? singleCurrencyTotal.totalAssets
    : wealth.summary.currency === "USD"
      ? 0
      : wealth.summary.totalAssets;
  const primaryLiabilities = singleCurrencyTotal
    ? singleCurrencyTotal.totalLiabilities
    : wealth.summary.currency === "USD"
      ? 0
      : wealth.summary.totalLiabilities;
  const primaryCurrency = singleCurrencyTotal
    ? singleCurrencyTotal.currency
    : wealth.summary.currency === "USD"
      ? "INR"
      : wealth.summary.currency || "INR";

  const totalGross = Math.max(0, primaryAssets) + Math.max(0, primaryLiabilities);
  const assetRatio =
    totalGross > 0 ? Math.round((Math.max(0, primaryAssets) / totalGross) * 100) : 100;

  return (
    <>
      <div className="space-y-3">
        <PageHeader title={`Welcome back, ${capitalizedFirstName}`} />

        <CommandBar>
          <CommandBarButton
            primary
            icon={<Upload className="h-3.5 w-3.5 text-white" />}
            onClick={openUpload}
            disabled={!isConnected}
          >
            Upload document
          </CommandBarButton>
          <CommandBarButton
            icon={<Camera className="h-3.5 w-3.5" />}
            onClick={() => openCamera()}
            disabled={!isConnected}
          >
            Scan
          </CommandBarButton>
          <CommandBarDivider />
          <CommandBarButton
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            item={{ key: "chat", label: "Ask AI", href: "/chat" }}
          />
          <CommandBarButton
            icon={<BellRing className="h-3.5 w-3.5" />}
            item={{ key: "reminders", label: "Reminders", href: "/reminders" }}
          />
        </CommandBar>
      </div>

      {needsSetup && (
        <section className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-muted/40 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-brand">
                {completedSetupCount}/{setupTasks.length}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Set up your personal vault
                </h2>
                <p className="text-xs text-text-muted">
                  Complete these steps to unlock full workspace capabilities.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full bg-brand transition-all duration-300"
                  style={{ width: `${(completedSetupCount / setupTasks.length) * 100}%` }}
                />
              </div>
              <Badge variant="info">Checklist</Badge>
            </div>
          </div>
          <div className="grid grid-cols-1 divide-y divide-border-subtle sm:grid-cols-2 sm:divide-y-0 sm:divide-x xl:grid-cols-4">
            {setupTasks.map((task) => (
              <Link
                key={task.label}
                href={task.href}
                className="flex items-start gap-3 p-4 transition-colors hover:bg-surface-muted/45"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    task.done
                      ? "border-success/30 bg-success-subtle text-success"
                      : "border-border bg-surface-muted text-text-muted",
                  )}
                >
                  {task.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-text-muted/60" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text-primary">
                    {task.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-text-muted">
                    {task.done ? "Completed" : task.detail}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Responsive Module Cards — Max 3 per row on desktop, 2 on tablet, 1 on mobile */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* 1. Documents */}
        <section className="card flex flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-subtle text-brand">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">Documents</h2>
                <p className="text-[11px] text-text-muted">Drive archive &amp; AI</p>
              </div>
            </div>
            <Link
              href="/documents"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              Open <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex flex-1 flex-col p-5">
            <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-lg border border-border-subtle bg-surface-muted/45 text-center">
              <div className="px-2 py-2.5">
                <p className="font-mono text-base font-semibold tabular-nums text-brand">
                  {documents.total}
                </p>
                <p className="text-[10.5px] font-medium text-text-muted">Documents</p>
              </div>
              <div className="px-2 py-2.5">
                <p className="font-mono text-base font-semibold tabular-nums text-text-primary">
                  {documents.folders}
                </p>
                <p className="text-[10.5px] font-medium text-text-muted">Folders</p>
              </div>
              <div className="px-2 py-2.5">
                <p className="font-mono text-base font-semibold tabular-nums text-success">
                  {documents.aiSummaries}
                </p>
                <p className="text-[10.5px] font-medium text-text-muted">AI ready</p>
              </div>
            </div>

            <div className="mt-4 flex-1 space-y-1">
              <p className="section-eyebrow px-1 pb-1">Recent uploads</p>
              {documents.recent.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-subtle bg-surface-muted/30 px-4 py-6 text-center text-xs text-text-muted">
                  Upload your first document to build your archive.
                </div>
              ) : (
                documents.recent.slice(0, 3).map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-brand/20 bg-brand-subtle text-brand">
                      <FileText className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-text-primary">
                        {doc.name}
                      </p>
                      <p className="truncate text-[10.5px] text-text-muted">
                        {doc.folder?.name || "Unfiled"} ·{" "}
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))
              )}
            </div>

            <Link
              href="/documents/library"
              className="mt-4 inline-flex items-center justify-between rounded-lg border border-border-subtle bg-surface-muted/50 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-border hover:text-text-primary"
            >
              <span>Browse full library</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* 2. Wealth */}
        <section className="card flex flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Wallet className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">Wealth</h2>
                <p className="text-[11px] text-text-muted">
                  {wealth.summary.accountCount} tracked account
                  {wealth.summary.accountCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <Link
              href="/wealth"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              Open <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex flex-1 flex-col p-5">
            {nonUsdTotals.length > 1 ? (
              <div className="space-y-2.5">
                {nonUsdTotals.map((total) => (
                  <div
                    key={total.currency}
                    className="rounded-lg border border-border-subtle bg-surface-muted/50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
                        Net worth · {total.currency}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-text-primary">
                        {formatCurrency(total.netWorth, total.currency)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10.5px] text-text-muted">
                      <span className="text-success tabular-nums">
                        +{formatCurrency(total.totalAssets, total.currency)}
                      </span>
                      <span className="text-danger tabular-nums">
                        -{formatCurrency(total.totalLiabilities, total.currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="section-eyebrow">Net Worth ({primaryCurrency})</p>
                <p className="mt-1 font-mono text-[1.5rem] font-semibold leading-8 tracking-tight tabular-nums text-text-primary">
                  {formatCurrency(primaryNetWorth, primaryCurrency)}
                </p>

                {totalGross > 0 && (
                  <div className="mt-2.5">
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="bg-emerald-600 dark:bg-emerald-400"
                        style={{ width: `${assetRatio}%` }}
                      />
                      <div className="bg-rose-500" style={{ width: `${100 - assetRatio}%` }} />
                    </div>
                  </div>
                )}

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border-subtle bg-surface-muted/45 px-2.5 py-2">
                    <p className="text-[10px] font-medium text-text-muted">Assets</p>
                    <p className="mt-0.5 truncate font-mono text-[12px] font-semibold tabular-nums text-success">
                      {formatCurrency(primaryAssets, primaryCurrency)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-surface-muted/45 px-2.5 py-2">
                    <p className="text-[10px] font-medium text-text-muted">Liabilities</p>
                    <p className="mt-0.5 truncate font-mono text-[12px] font-semibold tabular-nums text-danger">
                      {formatCurrency(primaryLiabilities, primaryCurrency)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex-1 space-y-1 border-t border-border-subtle pt-3">
              {wealth.accounts.length === 0 ? (
                <div className="py-4 text-center text-xs text-text-muted">
                  Add accounts to track your portfolio.
                </div>
              ) : (
                wealth.accounts.slice(0, 2).map((account) => {
                  const liability = isLiabilityType(account.type);
                  return (
                    <Link
                      key={account.id}
                      href={`/wealth/accounts/${account.id}`}
                      className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                            liability
                              ? "border-danger/20 bg-danger-subtle text-danger"
                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {liability ? (
                            <CreditCard className="h-3.5 w-3.5" />
                          ) : (
                            <Wallet className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-text-primary">
                            {account.name}
                          </p>
                          <p className="truncate text-[10px] capitalize text-text-muted">
                            {account.type.replace(/_/g, " ").toLowerCase()}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[11.5px] font-semibold tabular-nums",
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

            <Link
              href="/wealth/accounts"
              className="mt-4 inline-flex items-center justify-between rounded-lg border border-border-subtle bg-surface-muted/50 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-border hover:text-text-primary"
            >
              <span>Manage accounts</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* 3. Credentials */}
        <section className="card flex flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Lock className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">Credentials</h2>
                <p className="text-[11px] text-text-muted">
                  {credentials.hasVault ? `${credentialCount} secured items` : "Encrypted vault"}
                </p>
              </div>
            </div>
            <Link
              href="/credentials"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              Open <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex flex-1 flex-col p-5">
            {!credentials.hasVault ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted/35 p-4 text-center">
                <Lock className="mb-2 h-6 w-6 text-purple-600 dark:text-purple-400" />
                <p className="text-xs font-semibold text-text-primary">No credential vault</p>
                <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                  Create an encrypted vault for app logins, bank PINs, and 2FA codes.
                </p>
              </div>
            ) : (
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-lg border border-border-subtle bg-surface-muted/45 text-center">
                  <Link
                    href="/credentials/account"
                    className="px-2 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <p className="font-mono text-base font-semibold tabular-nums text-text-primary">
                      {credentials.appCount}
                    </p>
                    <p className="text-[10.5px] font-medium text-text-muted">App Pass</p>
                  </Link>
                  <Link
                    href="/credentials/bank"
                    className="px-2 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <p className="font-mono text-base font-semibold tabular-nums text-text-primary">
                      {credentials.bankCount}
                    </p>
                    <p className="text-[10.5px] font-medium text-text-muted">Bank Pass</p>
                  </Link>
                  <Link
                    href="/credentials?tab=AUTH"
                    className="px-2 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <p className="font-mono text-base font-semibold tabular-nums text-brand">
                      {authenticatorCount}
                    </p>
                    <p className="text-[10.5px] font-medium text-text-muted">2FA</p>
                  </Link>
                </div>

                <dl className="divide-y divide-border-subtle rounded-lg border border-border-subtle text-xs">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <dt className="flex items-center gap-1.5 text-text-muted">
                      <ShieldCheck className="h-3.5 w-3.5 text-success" />
                      Cipher
                    </dt>
                    <dd className="font-mono text-[11px] font-semibold text-text-primary">
                      AES-256-GCM
                    </dd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <dt className="flex items-center gap-1.5 text-text-muted">
                      <Star className="h-3.5 w-3.5 text-amber-500" /> Favorites
                    </dt>
                    <dd className="font-mono font-semibold tabular-nums text-text-primary">
                      {credentials.favoriteCount}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <dt className="flex items-center gap-1.5 text-text-muted">
                      <Users className="h-3.5 w-3.5 text-text-muted" /> Shared with you
                    </dt>
                    <dd className="font-mono font-semibold tabular-nums text-text-primary">
                      {credentials.sharedCount}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <Link
              href="/credentials"
              className="mt-4 inline-flex items-center justify-between rounded-lg border border-border-subtle bg-surface-muted/50 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-border hover:text-text-primary"
            >
              <span>Manage credentials</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* 4. Reminders */}
        <section className="card flex flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <BellRing className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">Reminders</h2>
                <p className="text-[11px] text-text-muted">
                  {attentionCount === 0
                    ? "All clear"
                    : `${attentionCount} upcoming item${attentionCount === 1 ? "" : "s"}`}
                </p>
              </div>
            </div>
            <Link
              href="/reminders"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              Open <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex flex-1 flex-col p-5">
            <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-lg border border-border-subtle bg-surface-muted/45 text-center">
              <div className="px-2 py-2.5">
                <p className="font-mono text-base font-semibold tabular-nums text-text-primary">
                  {customReminders.length}
                </p>
                <p className="text-[10.5px] font-medium text-text-muted">Tasks</p>
              </div>
              <div className="px-2 py-2.5">
                <p className="font-mono text-base font-semibold tabular-nums text-warning">
                  {documents.expiring.length}
                </p>
                <p className="text-[10.5px] font-medium text-text-muted">Expiring</p>
              </div>
              <div className="px-2 py-2.5">
                <p className="font-mono text-base font-semibold tabular-nums text-danger">
                  {wealth.reminders.length}
                </p>
                <p className="text-[10.5px] font-medium text-text-muted">Dues</p>
              </div>
            </div>

            <div className="mt-4 flex-1 space-y-1">
              <p className="section-eyebrow px-1 pb-1">Upcoming schedule</p>
              {combinedAlerts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-subtle bg-surface-muted/30 px-4 py-6 text-center text-xs text-text-muted">
                  No urgent renewals, dues, or reminders.
                </div>
              ) : (
                combinedAlerts.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex items-center justify-between gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-warning/25 bg-warning-subtle text-warning">
                        <CalendarClock className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-text-primary">
                          {item.title}
                        </p>
                        <p className="truncate font-mono text-[10.5px] tabular-nums text-text-muted">
                          {item.sub}
                        </p>
                      </div>
                    </div>
                    <Badge variant={item.badge.variant} className="shrink-0">
                      {item.badge.label}
                    </Badge>
                  </Link>
                ))
              )}
            </div>

            <Link
              href="/reminders"
              className="mt-4 inline-flex items-center justify-between rounded-lg border border-border-subtle bg-surface-muted/50 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-border hover:text-text-primary"
            >
              <span>Manage reminders</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

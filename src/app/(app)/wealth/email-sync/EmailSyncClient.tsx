"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock3,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { formatCurrency } from "@/lib/wealth";
import { csrfHeaders } from "@/lib/csrf-client";

type EmailConnection = {
  emailAddress: string;
  status: "CONNECTED" | "RECONNECT_REQUIRED" | "DISCONNECTED";
  lastSyncedAt: string | null;
  connectedAt: string;
  syncLookbackDays?: number | null;
};

type Account = {
  id: string;
  name: string;
  bankName: string | null;
  type: string;
  currency: string;
};

type Candidate = {
  id: string;
  gmailMessageId: string;
  sourceProvider: "GMAIL" | "OUTLOOK" | "FORWARDING";
  fromAddress: string;
  subject: string | null;
  bankName: string | null;
  merchant: string | null;
  description: string;
  amount: string | number;
  currency: string;
  type:
    | "DEPOSIT"
    | "WITHDRAWAL"
    | "PURCHASE"
    | "SALE"
    | "INTEREST"
    | "DIVIDEND"
    | "FEE"
    | "PAYMENT"
    | "REFUND"
    | "TRANSFER_IN"
    | "TRANSFER_OUT";
  referenceNumber: string | null;
  date: string;
  accountId: string | null;
  status: "PENDING" | "IMPORTED" | "DISMISSED";
  aiConfidence?: number | null;
  aiReason?: string | null;
};

interface Props {
  initialGmailConnection: EmailConnection | null;
  initialGmailHasMore: boolean;
  initialGmailLookbackDays: number;
  initialOutlookConnection: EmailConnection | null;
  initialOutlookHasMore: boolean;
  accounts: Account[];
  initialMessage?: string;
  initialError?: string;
}

function suggestedAccount(candidate: Candidate, accounts: Account[]) {
  if (candidate.accountId) return candidate.accountId;
  if (!candidate.bankName) return "";
  const emailBank = candidate.bankName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matches = accounts.filter((account) => {
    if (!account.bankName) return false;
    const accountBank = account.bankName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return accountBank.includes(emailBank) || emailBank.includes(accountBank);
  });
  return matches.length === 1 ? matches[0].id : "";
}

export function EmailSyncClient({
  initialGmailConnection,
  initialGmailHasMore,
  initialGmailLookbackDays,
  initialOutlookConnection,
  initialOutlookHasMore,
  accounts,
  initialMessage,
  initialError,
}: Props) {
  const router = useRouter();
  const { confirmAction } = useFeedback();

  // Gmail state
  const [gmailConnection, setGmailConnection] = useState<EmailConnection | null>(
    initialGmailConnection,
  );
  const [gmailHasMore, setGmailHasMore] = useState(initialGmailHasMore);
  const [gmailLookbackDays, setGmailLookbackDays] = useState(String(initialGmailLookbackDays));
  const [gmailBusy, setGmailBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);

  // Outlook state
  const [outlookConnection, setOutlookConnection] = useState<EmailConnection | null>(
    initialOutlookConnection,
  );
  const [outlookHasMore, setOutlookHasMore] = useState(initialOutlookHasMore);
  const [outlookBusy, setOutlookBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);

  // Review Queue state
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [accountSelections, setAccountSelections] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState(initialMessage || "");
  const [error, setError] = useState(initialError || "");

  const isGmailConnected = gmailConnection?.status === "CONNECTED";
  const isOutlookConnected = outlookConnection?.status === "CONNECTED";

  const loadPending = useCallback(async () => {
    setIsLoadingQueue(true);
    try {
      const response = await fetch("/api/integrations/gmail/imports?status=PENDING", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load pending transactions.");
      const rows = (data.imports || []) as Candidate[];
      setCandidates(rows);
      setAccountSelections((current) => {
        const next = { ...current };
        for (const row of rows) next[row.id] ||= suggestedAccount(row, accounts);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load pending transactions.");
    } finally {
      setIsLoadingQueue(false);
    }
  }, [accounts]);

  const refreshGmail = useCallback(async () => {
    const response = await fetch("/api/integrations/gmail/status", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setGmailConnection(data.connection || null);
      setGmailHasMore(Boolean(data.hasMore));
      if (data.connection?.syncLookbackDays) {
        setGmailLookbackDays(String(data.connection.syncLookbackDays));
      }
    }
  }, []);

  const refreshOutlook = useCallback(async () => {
    const response = await fetch("/api/integrations/outlook/status", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      setOutlookConnection(data.connection || null);
      setOutlookHasMore(Boolean(data.hasMore));
    }
  }, []);

  const loadPendingRef = useRef(loadPending);
  useEffect(() => {
    loadPendingRef.current = loadPending;
  }, [loadPending]);

  useEffect(() => {
    let isMounted = true;
    if (isMounted) {
      void loadPendingRef.current();
    }
    const refreshQueue = () => {
      if (isMounted) void loadPendingRef.current();
    };
    window.addEventListener("vaulty-email-imports-updated", refreshQueue);
    return () => {
      isMounted = false;
      window.removeEventListener("vaulty-email-imports-updated", refreshQueue);
    };
  }, []);

  // Clean up URL redirect query params after OAuth callback
  useEffect(() => {
    if (initialMessage || initialError) {
      router.replace("/wealth/email-sync");
    }
  }, [initialMessage, initialError, router]);

  // Gmail actions
  const handleConnectGmail = async () => {
    setError("");
    setGmailBusy("connect");
    try {
      const response = await fetch("/api/integrations/gmail/connect", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.authUrl)
        throw new Error(data.error || "Could not start Google authorization.");
      window.location.assign(data.authUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect Gmail.");
      setGmailBusy(null);
    }
  };

  const handleSyncGmail = async () => {
    setError("");
    setMessage("");
    setGmailBusy("sync");
    try {
      const response = await fetch("/api/integrations/gmail/sync", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          lookbackDays: Number(gmailLookbackDays),
          continuePage: gmailHasMore,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gmail sync failed.");
      setGmailHasMore(Boolean(data.hasMore));
      setMessage(
        `Gmail scan complete: examined ${data.messagesExamined} emails. Added ${data.added} transaction${data.added === 1 ? "" : "s"} to review${data.duplicates ? ` (${data.duplicates} already seen)` : ""}.`,
      );
      await Promise.all([loadPending(), refreshGmail()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gmail sync failed.");
      await refreshGmail().catch(() => undefined);
    } finally {
      setGmailBusy(null);
    }
  };

  const handleDisconnectGmail = async () => {
    if (
      !(await confirmAction({
        title: "Disconnect Gmail?",
        description:
          "Vaulty will stop scanning this inbox. Any transactions already imported into Wealth will remain.",
        confirmLabel: "Disconnect Gmail",
        tone: "danger",
      }))
    )
      return;

    setGmailBusy("disconnect");
    setError("");
    try {
      const response = await fetch("/api/integrations/gmail/disconnect", {
        method: "POST",
        headers: csrfHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect Gmail.");
      setGmailConnection(null);
      setGmailHasMore(false);
      setMessage("Gmail has been disconnected.");
      await loadPending();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Gmail.");
    } finally {
      setGmailBusy(null);
    }
  };

  // Outlook actions
  const handleConnectOutlook = async () => {
    setError("");
    setOutlookBusy("connect");
    try {
      const response = await fetch("/api/integrations/outlook/connect", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.authUrl)
        throw new Error(data.error || "Could not start Microsoft authorization.");
      window.location.assign(data.authUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect Outlook.");
      setOutlookBusy(null);
    }
  };

  const handleSyncOutlook = async () => {
    setError("");
    setMessage("");
    setOutlookBusy("sync");
    try {
      const response = await fetch("/api/integrations/outlook/sync", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ continuePage: outlookHasMore }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Outlook sync failed.");
      setOutlookHasMore(Boolean(data.hasMore));
      setMessage(
        `Outlook scan complete: examined ${data.messagesExamined} emails. Added ${data.added} transaction${data.added === 1 ? "" : "s"} to review${data.duplicates ? ` (${data.duplicates} already seen)` : ""}.`,
      );
      await Promise.all([loadPending(), refreshOutlook()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Outlook sync failed.");
      await refreshOutlook().catch(() => undefined);
    } finally {
      setOutlookBusy(null);
    }
  };

  const handleDisconnectOutlook = async () => {
    if (
      !(await confirmAction({
        title: "Disconnect Outlook?",
        description:
          "Vaulty will stop scanning this inbox. Any transactions already imported into Wealth will remain.",
        confirmLabel: "Disconnect Outlook",
        tone: "danger",
      }))
    )
      return;

    setOutlookBusy("disconnect");
    setError("");
    try {
      const response = await fetch("/api/integrations/outlook/disconnect", {
        method: "POST",
        headers: csrfHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect Outlook.");
      setOutlookConnection(null);
      setOutlookHasMore(false);
      setMessage("Outlook has been disconnected.");
      await loadPending();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Outlook.");
    } finally {
      setOutlookBusy(null);
    }
  };

  // Queue actions
  const toggleSelectAll = () => {
    if (selectedIds.length === candidates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(candidates.map((c) => c.id));
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  const updateAccount = (candidateId: string, accountId: string) => {
    setAccountSelections((current) => ({ ...current, [candidateId]: accountId }));
  };

  const dismissCandidate = async (candidateId: string) => {
    setError("");
    try {
      const response = await fetch("/api/integrations/gmail/imports", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ candidateId, status: "DISMISSED" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not dismiss transaction.");
      setCandidates((current) => current.filter((c) => c.id !== candidateId));
      setSelectedIds((current) => current.filter((id) => id !== candidateId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not dismiss transaction.");
    }
  };

  const importSelected = async () => {
    const items = candidates
      .filter((candidate) => selectedIds.includes(candidate.id))
      .map((candidate) => ({
        candidateId: candidate.id,
        accountId: accountSelections[candidate.id] || "",
      }));

    if (!items.length) {
      setError("Please select at least one transaction to import.");
      return;
    }
    if (items.some((item) => !item.accountId)) {
      setError("Please select a destination Wealth account for all checked transactions.");
      return;
    }

    setError("");
    setMessage("");
    setIsImporting(true);
    try {
      const response = await fetch("/api/integrations/gmail/imports/commit", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ items }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not import selected transactions.");
      setMessage(
        `Successfully imported ${data.importedCount} transaction${data.importedCount === 1 ? "" : "s"} into Wealth.`,
      );
      setSelectedIds([]);
      await loadPending();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import selected transactions.");
    } finally {
      setIsImporting(false);
    }
  };

  const activeConnectedCount = (isGmailConnected ? 1 : 0) + (isOutlookConnected ? 1 : 0);

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      {/* Connected Inboxes Section */}
      <section className="space-y-3">
        <SectionHeader
          icon={<Inbox className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          title="Connected inboxes"
          description="Read-only access to discover transaction alerts. Emails are analyzed locally & with Gemini AI."
          count={activeConnectedCount}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Gmail Card */}
          <Card className="flex flex-col justify-between p-5 transition-all">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">Google Gmail</h3>
                    <p className="text-[11px] text-text-muted">Personal Google inboxes</p>
                  </div>
                </div>
                <Badge variant={isGmailConnected ? "success" : "default"}>
                  {isGmailConnected ? "Connected" : "Not connected"}
                </Badge>
              </div>

              <div className="mt-4">
                {isGmailConnected ? (
                  <div className="space-y-2">
                    <p className="truncate text-xs font-semibold text-text-primary">
                      {gmailConnection?.emailAddress}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {gmailConnection?.lastSyncedAt
                        ? `Last scan: ${new Date(gmailConnection.lastSyncedAt).toLocaleString()}`
                        : "Never scanned"}
                    </p>
                    <div className="flex items-center gap-2 pt-1 text-xs text-text-muted">
                      <span>Lookback:</span>
                      <Select
                        className="h-7 rounded-lg px-2 text-xs"
                        value={gmailLookbackDays}
                        onChange={(e) => {
                          setGmailLookbackDays(e.target.value);
                          setGmailHasMore(false);
                        }}
                      >
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="90">Last 90 days</option>
                        <option value="180">Last 180 days</option>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-text-muted">
                    Connect your Gmail to detect automated banking alerts, UPI debits, and credit
                    card notifications.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border-subtle pt-3.5">
              {isGmailConnected ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnectGmail}
                    disabled={gmailBusy !== null}
                    className="text-text-muted hover:text-danger"
                  >
                    {gmailBusy === "disconnect" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unplug className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSyncGmail}
                    disabled={gmailBusy !== null || isLoadingQueue}
                  >
                    {gmailBusy === "sync" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {gmailBusy === "sync"
                      ? "Scanning…"
                      : gmailHasMore
                        ? "Scan next 30"
                        : "Scan emails"}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={handleConnectGmail} disabled={gmailBusy !== null}>
                  {gmailBusy === "connect" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Connect Gmail
                </Button>
              )}
            </div>
          </Card>

          {/* Outlook Card */}
          <Card className="flex flex-col justify-between p-5 transition-all">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">Microsoft Outlook</h3>
                    <p className="text-[11px] text-text-muted">Hotmail, Live & Outlook.com</p>
                  </div>
                </div>
                <Badge variant={isOutlookConnected ? "success" : "default"}>
                  {isOutlookConnected ? "Connected" : "Not connected"}
                </Badge>
              </div>

              <div className="mt-4">
                {isOutlookConnected ? (
                  <div className="space-y-2">
                    <p className="truncate text-xs font-semibold text-text-primary">
                      {outlookConnection?.emailAddress}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {outlookConnection?.lastSyncedAt
                        ? `Last scan: ${new Date(outlookConnection.lastSyncedAt).toLocaleString()}`
                        : "Never scanned"}
                    </p>
                    <p className="text-[11px] text-text-muted pt-1">
                      Scans batches of 30 recent alert emails via Microsoft Graph.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-text-muted">
                    Connect your Microsoft Outlook or Hotmail to discover recurring bank charges and
                    payment confirmations.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border-subtle pt-3.5">
              {isOutlookConnected ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnectOutlook}
                    disabled={outlookBusy !== null}
                    className="text-text-muted hover:text-danger"
                  >
                    {outlookBusy === "disconnect" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unplug className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSyncOutlook}
                    disabled={outlookBusy !== null || isLoadingQueue}
                  >
                    {outlookBusy === "sync" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {outlookBusy === "sync"
                      ? "Scanning…"
                      : outlookHasMore
                        ? "Scan next 30"
                        : "Scan emails"}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={handleConnectOutlook} disabled={outlookBusy !== null}>
                  {outlookBusy === "connect" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Connect Outlook
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Security assurance banner */}
        <div className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-muted/40 p-3 text-xs text-text-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>
            Read-only email authorization. Only financial alert emails and PDF statements are
            parsed. Full emails are never stored.
          </span>
        </div>
      </section>

      {/* Review Queue Section */}
      <section className="space-y-4 pt-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Awaiting review"
            value={candidates.length}
            icon={<Clock3 className="h-4 w-4" />}
            hint="Queue"
            tone="amber"
          />
          <StatCard
            label="Selected to import"
            value={selectedIds.length}
            icon={<Check className="h-4 w-4" />}
            hint="Ready"
            tone="emerald"
          />
          <StatCard
            label="Active accounts"
            value={accounts.length}
            icon={<Wallet className="h-4 w-4" />}
            hint="Wealth"
            tone="violet"
          />
        </div>

        <SectionHeader
          icon={<Clock3 className="h-4 w-4 text-amber-500" />}
          title="Discovered transactions"
          description="Review parsed transactions, verify the matched wealth account, and import into your balance history."
          count={candidates.length}
          action={
            candidates.length > 0 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleSelectAll}
                  disabled={isImporting || candidates.length === 0}
                >
                  {selectedIds.length === candidates.length ? "Deselect all" : "Select all"}
                </Button>
                <Button
                  size="sm"
                  onClick={importSelected}
                  disabled={!selectedIds.length || isImporting || accounts.length === 0}
                >
                  {isImporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Import ({selectedIds.length})
                </Button>
              </div>
            ) : undefined
          }
        />

        {accounts.length === 0 && (
          <Alert variant="warning">
            Add at least one active Wealth account to import discovered transactions.
          </Alert>
        )}

        {isLoadingQueue ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card flex items-center gap-3 p-4">
                <div className="skeleton h-5 w-5 rounded" />
                <div className="skeleton h-9 w-9 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-1/3" />
                  <div className="skeleton h-3 w-1/4" />
                </div>
                <div className="skeleton h-8 w-36 rounded-lg" />
                <div className="skeleton h-5 w-20" />
              </div>
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title="No transactions awaiting review"
              description="When you scan your connected Gmail or Outlook inboxes, transaction candidates found from banks, credit cards, or payment services will appear here for your confirmation."
            />
          </Card>
        ) : (
          <div className="space-y-2.5">
            {candidates.map((candidate) => {
              const debit = candidate.type === "WITHDRAWAL";
              const selected = selectedIds.includes(candidate.id);

              return (
                <Card
                  key={candidate.id}
                  className={`p-4 transition-all ${
                    selected ? "border-brand/40 bg-brand-subtle/15" : "hover:border-border"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left: Checkbox + icon + details */}
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(candidate.id)}
                        className="mt-1 h-4 w-4 rounded border-border-subtle text-brand focus:ring-brand"
                        aria-label={`Select ${candidate.description}`}
                      />
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                          debit
                            ? "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {debit ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <ArrowDownLeft className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-xs font-semibold text-text-primary">
                            {candidate.description}
                          </p>
                          <span
                            className={`text-xs font-bold tabular-nums sm:hidden ${
                              debit
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {debit ? "−" : "+"}
                            {formatCurrency(Number(candidate.amount), candidate.currency, 2)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-text-muted">
                          {candidate.bankName || candidate.fromAddress} ·{" "}
                          {new Date(candidate.date).toLocaleDateString()}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                            <Mail className="h-2.5 w-2.5" />
                            {candidate.sourceProvider === "FORWARDING"
                              ? "Forwarded"
                              : candidate.sourceProvider === "OUTLOOK"
                                ? "Outlook"
                                : "Gmail"}
                          </span>
                          {typeof candidate.aiConfidence === "number" && (
                            <span
                              className="inline-flex items-center rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
                              title={candidate.aiReason || "AI confidence"}
                            >
                              Gemini {Math.round(candidate.aiConfidence * 100)}%
                            </span>
                          )}
                          {candidate.referenceNumber && (
                            <span className="inline-flex rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                              Ref: {candidate.referenceNumber}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Account selector + Amount + Dismiss */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle sm:flex-row sm:items-center sm:border-t-0 sm:pt-0 lg:w-[440px] lg:shrink-0">
                      <div className="flex-1 min-w-0">
                        <Select
                          className="h-8.5 w-full rounded-lg px-2.5 text-xs"
                          value={accountSelections[candidate.id] || ""}
                          onChange={(e) => updateAccount(candidate.id, e.target.value)}
                        >
                          <option value="">Select Wealth account…</option>
                          {accounts
                            .filter((a) => a.currency === candidate.currency)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                                {a.bankName ? ` (${a.bankName})` : ""}
                              </option>
                            ))}
                        </Select>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <span
                          className={`hidden sm:inline text-sm font-semibold tabular-nums ${
                            debit
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {debit ? "−" : "+"}
                          {formatCurrency(Number(candidate.amount), candidate.currency, 2)}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => dismissCandidate(candidate.id)}
                          aria-label="Dismiss transaction"
                          title="Dismiss transaction"
                          className="h-8 gap-1 text-xs text-text-muted hover:text-danger hover:border-danger/30 hover:bg-danger-subtle transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

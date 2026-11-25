"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Check,
  Clock3,
  FileText,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
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
import { StatCard } from "@/components/ui/StatCard";
import { Checkbox } from "@/components/ui/Checkbox";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { formatCurrency } from "@/lib/wealth";
import { csrfHeaders } from "@/lib/csrf-client";
import { FolderTreeSelect } from "@/components/ui/FolderTreeSelect";

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

type Folder = {
  id: string;
  name: string;
  parentId?: string | null;
};

type TransactionCandidate = {
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

type DocumentCandidate = {
  id: string;
  emailMessageId: string;
  sourceProvider: "GMAIL" | "OUTLOOK" | "FORWARDING";
  fromAddress: string;
  subject: string | null;
  receivedAt: string;
  documentTitle: string;
  documentType: string;
  filename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  extractedSummary: string | null;
  expiryDate: string | null;
  aiConfidence?: number | null;
  aiReason?: string | null;
  status: "PENDING" | "IMPORTED" | "DISMISSED";
};

type ReminderCandidate = {
  id: string;
  emailMessageId: string;
  sourceProvider: "GMAIL" | "OUTLOOK" | "FORWARDING";
  fromAddress: string;
  subject: string | null;
  receivedAt: string;
  title: string;
  description: string | null;
  category: "PAYMENT" | "SUBSCRIPTION" | "INSURANCE" | "DOCUMENT" | "PERSONAL";
  dueAt: string;
  amount: string | number | null;
  currency: string | null;
  aiConfidence?: number | null;
  aiReason?: string | null;
  status: "PENDING" | "IMPORTED" | "DISMISSED";
};

interface Props {
  initialInboundConfig?: {
    forwardingAddress: string;
    enabled: boolean;
  };
  initialGmailConnection: EmailConnection | null;
  initialGmailHasMore: boolean;
  initialGmailLookbackDays: number;
  initialOutlookConnection: EmailConnection | null;
  initialOutlookHasMore: boolean;
  initialOutlookLookbackDays?: number;
  accounts: Account[];
  folders: Folder[];
  initialCounts: {
    transactions: number;
    documents: number;
    reminders: number;
  };
  initialMessage?: string;
  initialError?: string;
}

function suggestedAccount(candidate: TransactionCandidate, accounts: Account[]) {
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
  initialInboundConfig,
  initialGmailConnection,
  initialGmailHasMore,
  initialGmailLookbackDays,
  initialOutlookConnection,
  initialOutlookHasMore,
  initialOutlookLookbackDays = 7,
  accounts,
  folders,
  initialMessage,
  initialError,
}: Props) {
  const router = useRouter();
  const { confirmAction } = useFeedback();
  const [copiedInbound, setCopiedInbound] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"transactions" | "documents" | "reminders">(
    "transactions",
  );

  // Connection State
  const [gmailConnection, setGmailConnection] = useState<EmailConnection | null>(
    initialGmailConnection,
  );
  const [gmailHasMore, setGmailHasMore] = useState(initialGmailHasMore);
  const [gmailLookbackDays, setGmailLookbackDays] = useState(String(initialGmailLookbackDays));
  const [gmailBusy, setGmailBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);

  const [outlookConnection, setOutlookConnection] = useState<EmailConnection | null>(
    initialOutlookConnection,
  );
  const [outlookHasMore, setOutlookHasMore] = useState(initialOutlookHasMore);
  const [outlookLookbackDays, setOutlookLookbackDays] = useState(
    String(initialOutlookLookbackDays),
  );
  const [outlookBusy, setOutlookBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);

  // Status & Feedback
  const [message, setMessage] = useState(initialMessage || "");
  const [error, setError] = useState(initialError || "");

  // Transactions State
  const [transactions, setTransactions] = useState<TransactionCandidate[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [txLoading, setTxLoading] = useState(false);
  const [txActingId, setTxActingId] = useState<string | null>(null);
  const [txBulkBusy, setTxBulkBusy] = useState<"commit" | "dismiss" | null>(null);

  // Documents State
  const [documents, setDocuments] = useState<DocumentCandidate[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Record<string, string>>({});
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docLoading, setDocLoading] = useState(false);
  const [docActingId, setDocActingId] = useState<string | null>(null);
  const [docBulkBusy, setDocBulkBusy] = useState<"import" | "dismiss" | null>(null);

  // Reminders State
  const [now] = useState(() => Date.now());
  const [reminders, setReminders] = useState<ReminderCandidate[]>([]);
  const [selectedRemIds, setSelectedRemIds] = useState<Set<string>>(new Set());
  const [remLoading, setRemLoading] = useState(false);
  const [remActingId, setRemActingId] = useState<string | null>(null);
  const [remBulkBusy, setRemBulkBusy] = useState<"import" | "dismiss" | null>(null);

  // Load Transactions
  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const response = await fetch("/api/integrations/gmail/imports?status=PENDING", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load transactions.");
      const data = await response.json();
      const list: TransactionCandidate[] = data.imports || [];
      setTransactions(list);
      setSelectedAccounts((prev) => {
        const next = { ...prev };
        for (const item of list) {
          if (!next[item.id]) {
            next[item.id] = suggestedAccount(item, accounts);
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Load transactions error:", err);
    } finally {
      setTxLoading(false);
    }
  }, [accounts]);

  // Load Documents
  const loadDocuments = useCallback(async () => {
    setDocLoading(true);
    try {
      const response = await fetch("/api/integrations/email/documents?status=PENDING", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load documents.");
      const data = await response.json();
      const list: DocumentCandidate[] = data.documents || [];
      setDocuments(list);
    } catch (err) {
      console.error("Load documents error:", err);
    } finally {
      setDocLoading(false);
    }
  }, []);

  // Load Reminders
  const loadReminders = useCallback(async () => {
    setRemLoading(true);
    try {
      const response = await fetch("/api/integrations/email/reminders?status=PENDING", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load reminders.");
      const data = await response.json();
      const list: ReminderCandidate[] = data.reminders || [];
      setReminders(list);
    } catch (err) {
      console.error("Load reminders error:", err);
    } finally {
      setRemLoading(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTransactions();
      void loadDocuments();
      void loadReminders();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadTransactions, loadDocuments, loadReminders]);

  // Clean URL params after OAuth callback
  useEffect(() => {
    if (initialMessage || initialError) {
      router.replace("/email-sync");
    }
  }, [initialMessage, initialError, router]);

  // Gmail Handlers
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
        `Gmail scan complete: examined ${data.messagesExamined} emails. Found ${data.added || 0} transaction(s), ${data.documentsCount || 0} document(s), and ${data.remindersCount || 0} reminder(s).`,
      );
      await Promise.all([loadTransactions(), loadDocuments(), loadReminders()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gmail sync failed.");
    } finally {
      setGmailBusy(null);
    }
  };

  const handleDisconnectGmail = async () => {
    if (
      !(await confirmAction({
        title: "Disconnect Gmail?",
        description:
          "Vaulty will stop scanning this inbox. Any transactions, documents, and reminders already imported will remain.",
        confirmLabel: "Disconnect",
      }))
    ) {
      return;
    }

    setError("");
    setGmailBusy("disconnect");
    try {
      const response = await fetch("/api/integrations/gmail/disconnect", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!response.ok) throw new Error("Could not disconnect Gmail.");
      setGmailConnection(null);
      setGmailHasMore(false);
      setMessage("Gmail inbox disconnected.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Gmail.");
    } finally {
      setGmailBusy(null);
    }
  };

  // Outlook Handlers
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
        body: JSON.stringify({
          lookbackDays: Number(outlookLookbackDays),
          continuePage: outlookHasMore,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Outlook sync failed.");
      setOutlookHasMore(Boolean(data.hasMore));
      setMessage(
        `Outlook scan complete: examined ${data.messagesExamined} emails. Found ${data.added || 0} transaction(s), ${data.documentsCount || 0} document(s), and ${data.remindersCount || 0} reminder(s).`,
      );
      await Promise.all([loadTransactions(), loadDocuments(), loadReminders()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Outlook sync failed.");
    } finally {
      setOutlookBusy(null);
    }
  };

  const handleDisconnectOutlook = async () => {
    if (
      !(await confirmAction({
        title: "Disconnect Outlook?",
        description:
          "Vaulty will stop scanning this inbox. Any transactions, documents, and reminders already imported will remain.",
        confirmLabel: "Disconnect",
      }))
    ) {
      return;
    }

    setError("");
    setOutlookBusy("disconnect");
    try {
      const response = await fetch("/api/integrations/outlook/disconnect", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!response.ok) throw new Error("Could not disconnect Outlook.");
      setOutlookConnection(null);
      setOutlookHasMore(false);
      setMessage("Outlook inbox disconnected.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Outlook.");
    } finally {
      setOutlookBusy(null);
    }
  };

  // Transaction Actions
  const handleCommitTransaction = async (candidate: TransactionCandidate) => {
    const accountId = selectedAccounts[candidate.id];
    if (!accountId) {
      setError("Please select a wealth account for this transaction.");
      return;
    }
    setError("");
    setTxActingId(candidate.id);
    try {
      const response = await fetch("/api/integrations/gmail/imports/commit", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          items: [{ candidateId: candidate.id, accountId }],
        }),
      });
      if (!response.ok) throw new Error("Failed to commit transaction.");
      setTransactions((prev) => prev.filter((item) => item.id !== candidate.id));
      setMessage(`Imported transaction into wealth account.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setTxActingId(null);
    }
  };

  const handleDismissTransaction = async (candidateId: string) => {
    setError("");
    setTxActingId(candidateId);
    try {
      const response = await fetch("/api/integrations/gmail/imports", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ candidateId, status: "DISMISSED" }),
      });
      if (!response.ok) throw new Error("Failed to dismiss transaction.");
      setTransactions((prev) => prev.filter((item) => item.id !== candidateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dismiss failed.");
    } finally {
      setTxActingId(null);
    }
  };

  const handleCommitAllTransactions = async () => {
    const eligible = transactions.filter((t) => Boolean(selectedAccounts[t.id]));
    if (eligible.length === 0) {
      setError(
        "Please select destination wealth accounts for the transactions you want to import.",
      );
      return;
    }
    setError("");
    setTxBulkBusy("commit");
    try {
      const items = eligible.map((t) => ({
        candidateId: t.id,
        accountId: selectedAccounts[t.id],
      }));
      const response = await fetch("/api/integrations/gmail/imports/commit", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error("Bulk transaction import failed.");
      const committedIds = new Set(items.map((i) => i.candidateId));
      setTransactions((prev) => prev.filter((item) => !committedIds.has(item.id)));
      setMessage(`Imported ${items.length} transaction(s) into wealth.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk import failed.");
    } finally {
      setTxBulkBusy(null);
    }
  };

  // Transactions Selection & Actions
  const toggleSelectTx = (id: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllTx = () => {
    if (selectedTxIds.size === transactions.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(transactions.map((t) => t.id)));
    }
  };

  const handleCommitSelectedTransactions = async () => {
    const candidates = transactions.filter((t) => selectedTxIds.has(t.id));
    if (candidates.length === 0) return;

    const unassigned = candidates.find((t) => !selectedAccounts[t.id]);
    if (unassigned) {
      setError(
        `Please assign a destination wealth account for "${unassigned.description || unassigned.bankName || "transaction"}".`,
      );
      return;
    }

    setError("");
    setTxBulkBusy("commit");
    try {
      const items = candidates.map((t) => ({
        candidateId: t.id,
        accountId: selectedAccounts[t.id],
      }));
      const response = await fetch("/api/integrations/gmail/imports/commit", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error("Bulk transaction import failed.");
      const committedIds = new Set(items.map((i) => i.candidateId));
      setTransactions((prev) => prev.filter((item) => !committedIds.has(item.id)));
      setSelectedTxIds((prev) => {
        const next = new Set(prev);
        committedIds.forEach((id) => next.delete(id));
        return next;
      });
      setMessage(`Imported ${items.length} transaction(s) into wealth.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk import failed.");
    } finally {
      setTxBulkBusy(null);
    }
  };

  const handleDismissSelectedTransactions = async () => {
    const ids = Array.from(selectedTxIds);
    if (ids.length === 0) return;

    setError("");
    setTxBulkBusy("dismiss");
    try {
      const response = await fetch("/api/integrations/gmail/imports", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ candidateIds: ids, status: "DISMISSED" }),
      });
      if (!response.ok) throw new Error("Bulk transaction dismissal failed.");
      const dismissedIds = new Set(ids);
      setTransactions((prev) => prev.filter((item) => !dismissedIds.has(item.id)));
      setSelectedTxIds(new Set());
      setMessage(`Dismissed ${ids.length} transaction(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk dismissal failed.");
    } finally {
      setTxBulkBusy(null);
    }
  };

  // Document Actions
  const handleImportDocument = async (doc: DocumentCandidate) => {
    setError("");
    setDocActingId(doc.id);
    try {
      const folderId = selectedFolders[doc.id];
      const response = await fetch("/api/integrations/email/documents/import", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: doc.id, folderId }),
      });
      if (!response.ok) throw new Error("Failed to import document.");
      setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
      setMessage(`Imported "${doc.documentTitle}" to Document Vault.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document import failed.");
    } finally {
      setDocActingId(null);
    }
  };

  const handleDismissDocument = async (id: string) => {
    setError("");
    setDocActingId(id);
    try {
      const response = await fetch("/api/integrations/email/documents/dismiss", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Failed to dismiss document.");
      setDocuments((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document dismiss failed.");
    } finally {
      setDocActingId(null);
    }
  };

  const handleImportAllDocuments = async () => {
    if (documents.length === 0) return;
    setError("");
    setDocBulkBusy("import");
    try {
      const response = await fetch("/api/integrations/email/documents/import", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("Failed to import all documents.");
      const data = await response.json();
      setDocuments([]);
      setMessage(`Successfully imported ${data.count} document(s) to Document Vault.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk document import failed.");
    } finally {
      setDocBulkBusy(null);
    }
  };

  // Documents Bulk Selection & Actions
  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllDocs = () => {
    if (selectedDocIds.size === documents.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(documents.map((d) => d.id)));
    }
  };

  const handleImportSelectedDocuments = async () => {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;

    setError("");
    setDocBulkBusy("import");
    try {
      const response = await fetch("/api/integrations/email/documents/import", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, folderMapping: selectedFolders }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to import selected documents.");
      }
      const data = await response.json();
      const importedIds = new Set(ids);
      setDocuments((prev) => prev.filter((d) => !importedIds.has(d.id)));
      setSelectedDocIds(new Set());
      setMessage(
        `Successfully imported ${data.count || ids.length} document(s) to Google Drive and Vault.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk document import failed.");
    } finally {
      setDocBulkBusy(null);
    }
  };

  const handleDismissSelectedDocuments = async () => {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;

    setError("");
    setDocBulkBusy("dismiss");
    try {
      const response = await fetch("/api/integrations/email/documents/dismiss", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Failed to dismiss selected documents.");
      const dismissedIds = new Set(ids);
      setDocuments((prev) => prev.filter((d) => !dismissedIds.has(d.id)));
      setSelectedDocIds(new Set());
      setMessage(`Dismissed ${ids.length} document(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk document dismiss failed.");
    } finally {
      setDocBulkBusy(null);
    }
  };

  // Reminder Actions
  const toggleSelectReminder = (id: string) => {
    setSelectedRemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllReminders = () => {
    if (selectedRemIds.size === reminders.length) {
      setSelectedRemIds(new Set());
    } else {
      setSelectedRemIds(new Set(reminders.map((r) => r.id)));
    }
  };

  const handleImportSelectedReminders = async () => {
    const ids = Array.from(selectedRemIds);
    if (ids.length === 0) return;

    setError("");
    setRemBulkBusy("import");
    try {
      const response = await fetch("/api/integrations/email/reminders/import", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Failed to add selected reminders.");
      const data = await response.json();
      const importedIds = new Set(ids);
      setReminders((prev) => prev.filter((r) => !importedIds.has(r.id)));
      setSelectedRemIds(new Set());
      setMessage(`Added ${data.count || ids.length} reminder(s) to Reminders.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk reminder import failed.");
    } finally {
      setRemBulkBusy(null);
    }
  };

  const handleDismissSelectedReminders = async () => {
    const ids = Array.from(selectedRemIds);
    if (ids.length === 0) return;

    setError("");
    setRemBulkBusy("dismiss");
    try {
      const response = await fetch("/api/integrations/email/reminders/dismiss", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Failed to dismiss selected reminders.");
      const dismissedIds = new Set(ids);
      setReminders((prev) => prev.filter((r) => !dismissedIds.has(r.id)));
      setSelectedRemIds(new Set());
      setMessage(`Dismissed ${ids.length} reminder(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk reminder dismiss failed.");
    } finally {
      setRemBulkBusy(null);
    }
  };
  const handleImportReminder = async (rem: ReminderCandidate) => {
    setError("");
    setRemActingId(rem.id);
    try {
      const response = await fetch("/api/integrations/email/reminders/import", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: rem.id }),
      });
      if (!response.ok) throw new Error("Failed to add reminder.");
      setReminders((prev) => prev.filter((item) => item.id !== rem.id));
      setMessage(`Added reminder "${rem.title}" to Reminders.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reminder import failed.");
    } finally {
      setRemActingId(null);
    }
  };

  const handleDismissReminder = async (id: string) => {
    setError("");
    setRemActingId(id);
    try {
      const response = await fetch("/api/integrations/email/reminders/dismiss", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Failed to dismiss reminder.");
      setReminders((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reminder dismiss failed.");
    } finally {
      setRemActingId(null);
    }
  };

  const handleImportAllReminders = async () => {
    if (reminders.length === 0) return;
    setError("");
    setRemBulkBusy("import");
    try {
      const response = await fetch("/api/integrations/email/reminders/import", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("Failed to import all reminders.");
      const data = await response.json();
      setReminders([]);
      setMessage(`Successfully added ${data.count} reminder(s) to your calendar.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk reminder import failed.");
    } finally {
      setRemBulkBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant="success">
          <div className="flex items-center justify-between">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="ml-2 text-text-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Alert>
      )}
      {error && (
        <Alert variant="danger">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-2 text-text-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Alert>
      )}

      {/* Connected Provider Accounts */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <Mail className="h-4.5 w-4.5 text-indigo-500" />
          Connected Inboxes
        </h2>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Gmail Card */}
          <Card className="p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-600 font-bold text-sm">
                  G
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-text-primary">Google Gmail</h3>
                  <p className="text-xs text-text-muted">
                    {gmailConnection ? gmailConnection.emailAddress : "Read-only access"}
                  </p>
                </div>
              </div>
              <Badge variant={gmailConnection?.status === "CONNECTED" ? "success" : "default"}>
                {gmailConnection?.status === "CONNECTED" ? "Connected" : "Not connected"}
              </Badge>
            </div>

            {gmailConnection?.status === "CONNECTED" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-text-muted border-t border-border-subtle pt-3">
                  <span>Last synced:</span>
                  <span className="font-medium text-text-secondary">
                    {gmailConnection.lastSyncedAt
                      ? new Date(gmailConnection.lastSyncedAt).toLocaleString()
                      : "Never"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={gmailLookbackDays}
                    onChange={(e) => setGmailLookbackDays(e.target.value)}
                    className="text-xs h-8"
                  >
                    <option value="2">Last 2 days</option>
                    <option value="7">Last 7 days</option>
                    <option value="14">Last 14 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="60">Last 60 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="180">Last 180 days</option>
                  </Select>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSyncGmail}
                    disabled={Boolean(gmailBusy)}
                    className="flex-1"
                  >
                    {gmailBusy === "sync" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {gmailHasMore ? "Scan Next Batch" : "Scan Inbox"}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDisconnectGmail}
                    disabled={Boolean(gmailBusy)}
                  >
                    <Unplug className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-border-subtle pt-3 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConnectGmail}
                  disabled={Boolean(gmailBusy)}
                >
                  {gmailBusy === "connect" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  )}
                  Connect Gmail
                </Button>
              </div>
            )}
          </Card>

          {/* Outlook Card */}
          <Card className="p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 font-bold text-sm">
                  O
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-text-primary">Microsoft Outlook</h3>
                  <p className="text-xs text-text-muted">
                    {outlookConnection ? outlookConnection.emailAddress : "Read-only access"}
                  </p>
                </div>
              </div>
              <Badge variant={outlookConnection?.status === "CONNECTED" ? "success" : "default"}>
                {outlookConnection?.status === "CONNECTED" ? "Connected" : "Not connected"}
              </Badge>
            </div>

            {outlookConnection?.status === "CONNECTED" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-text-muted border-t border-border-subtle pt-3">
                  <span>Last synced:</span>
                  <span className="font-medium text-text-secondary">
                    {outlookConnection.lastSyncedAt
                      ? new Date(outlookConnection.lastSyncedAt).toLocaleString()
                      : "Never"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={outlookLookbackDays}
                    onChange={(e) => setOutlookLookbackDays(e.target.value)}
                    className="text-xs h-8"
                  >
                    <option value="2">Last 2 days</option>
                    <option value="7">Last 7 days</option>
                    <option value="14">Last 14 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="60">Last 60 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="180">Last 180 days</option>
                  </Select>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSyncOutlook}
                    disabled={Boolean(outlookBusy)}
                    className="flex-1"
                  >
                    {outlookBusy === "sync" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {outlookHasMore ? "Scan Next Batch" : "Scan Inbox"}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDisconnectOutlook}
                    disabled={Boolean(outlookBusy)}
                  >
                    <Unplug className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-border-subtle pt-3 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConnectOutlook}
                  disabled={Boolean(outlookBusy)}
                >
                  {outlookBusy === "connect" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  )}
                  Connect Outlook
                </Button>
              </div>
            )}
          </Card>

          {/* Inbound Forwarding Card */}
          <Card className="p-5 flex flex-col justify-between space-y-4 border-violet-500/20 bg-gradient-to-b from-violet-500/5 to-transparent">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold text-sm">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-semibold text-sm text-text-primary">Inbound Forwarding</h3>
                    <Badge
                      variant="violet"
                      className="text-[10px] py-0 px-1.5 border-violet-500/30 text-violet-600 dark:text-violet-400"
                    >
                      Privacy First
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted">No mailbox OAuth required</p>
                </div>
              </div>
              <Badge variant={initialInboundConfig?.enabled ? "success" : "default"}>
                {initialInboundConfig?.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-text-muted">
                Forward bank statements, insurance policies, or bills directly to Vaulty for
                automatic decryption and staging:
              </p>

              <div className="flex items-center gap-2 bg-surface-raised border border-border-subtle rounded-lg px-2.5 py-1.5">
                <code className="text-xs font-mono text-text-primary select-all flex-1 truncate">
                  {initialInboundConfig?.forwardingAddress || "username+token@vaulty.mnilay.com"}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (initialInboundConfig?.forwardingAddress) {
                      navigator.clipboard.writeText(initialInboundConfig.forwardingAddress);
                      setCopiedInbound(true);
                      setTimeout(() => setCopiedInbound(false), 2000);
                    }
                  }}
                  className="h-7 px-2 text-xs"
                >
                  {copiedInbound ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500 mr-1" />
                      Copied
                    </>
                  ) : (
                    "Copy"
                  )}
                </Button>
              </div>

              <p className="text-[11px] text-text-muted italic">
                💡 Password-protected statements are automatically unlocked using your saved PDF
                password rules.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Discovery Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Pending Transactions"
          value={transactions.length}
          icon={<Wallet className="h-4.5 w-4.5" />}
          hint="Awaiting account approval"
          tone="emerald"
        />
        <StatCard
          label="Discovered Documents"
          value={documents.length}
          icon={<FileText className="h-4.5 w-4.5" />}
          hint="Invoices, policies, tax docs"
          tone="brand"
        />
        <StatCard
          label="Due Date Reminders"
          value={reminders.length}
          icon={<BellRing className="h-4.5 w-4.5" />}
          hint="Bill payments & renewals"
          tone="amber"
        />
      </div>

      {/* Module Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => setActiveTab("transactions")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "transactions"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            <Wallet className="h-4 w-4" />
            Transactions
            {transactions.length > 0 && (
              <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {transactions.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "documents"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            <FileText className="h-4 w-4" />
            Important Documents
            {documents.length > 0 && (
              <span className="ml-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                {documents.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reminders")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "reminders"
                ? "border-amber-600 text-amber-600 dark:text-amber-400"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            <BellRing className="h-4 w-4" />
            Reminders & Due Dates
            {reminders.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                {reminders.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Transactions Content */}
        {activeTab === "transactions" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-muted/40 p-3 rounded-xl border border-border-subtle">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-text-primary">
                <Checkbox
                  checked={transactions.length > 0 && selectedTxIds.size === transactions.length}
                  onChange={toggleSelectAllTx}
                  disabled={transactions.length === 0}
                />
                <span>Select all ({transactions.length})</span>
              </label>

              {selectedTxIds.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-150">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">
                    {selectedTxIds.size} selected
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleCommitSelectedTransactions}
                    disabled={Boolean(txBulkBusy)}
                  >
                    {txBulkBusy === "commit" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Import Selected ({selectedTxIds.size})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDismissSelectedTransactions}
                    disabled={Boolean(txBulkBusy)}
                  >
                    {txBulkBusy === "dismiss" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Dismiss Selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTxIds(new Set())}
                    disabled={Boolean(txBulkBusy)}
                  >
                    Clear
                  </Button>
                </div>
              ) : (
                transactions.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCommitAllTransactions}
                    disabled={Boolean(txBulkBusy)}
                  >
                    {txBulkBusy === "commit" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Import All Assigned
                  </Button>
                )
              )}
            </div>

            {txLoading ? (
              <div className="card p-8 flex items-center justify-center text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading transaction discoveries...
              </div>
            ) : transactions.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-6 w-6" />}
                title="No pending transactions"
                description="Scan your connected inboxes to discover new bank alerts and transaction emails."
              />
            ) : (
              <div className="space-y-3">
                {transactions.map((t) => {
                  const isActing = txActingId === t.id;
                  const isSelected = selectedTxIds.has(t.id);
                  const isCredit =
                    t.type === "DEPOSIT" ||
                    t.type === "TRANSFER_IN" ||
                    t.type === "INTEREST" ||
                    t.type === "DIVIDEND" ||
                    t.type === "REFUND";

                  return (
                    <Card
                      key={t.id}
                      className={`feed-item p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                        isSelected ? "border-brand ring-1 ring-brand/20 bg-brand/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleSelectTx(t.id)}
                          className="mt-2.5 shrink-0"
                          aria-label={`Select ${t.description || "transaction"}`}
                        />

                        <div
                          className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isCredit
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-zinc-500/10 text-text-muted"
                          }`}
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-text-primary truncate">
                              {t.description || t.merchant || t.bankName || "Transaction"}
                            </span>
                            <Badge variant="default">{t.type}</Badge>
                            <span className="text-xs text-text-muted">
                              {new Date(t.date).toLocaleDateString()}
                            </span>
                          </div>

                          <p className="text-xs text-text-muted truncate">
                            {t.bankName ? `${t.bankName} • ` : ""}
                            {t.fromAddress}
                            {t.referenceNumber ? ` • Ref: ${t.referenceNumber}` : ""}
                          </p>

                          {t.aiReason && (
                            <p className="text-[11px] text-text-muted italic truncate">
                              AI: {t.aiReason} ({(Number(t.aiConfidence || 0) * 100).toFixed(0)}%)
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                        <span
                          className={`font-semibold text-sm ${
                            isCredit
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-text-primary"
                          }`}
                        >
                          {isCredit ? "+" : "-"}
                          {formatCurrency(Number(t.amount), t.currency)}
                        </span>

                        <Select
                          value={selectedAccounts[t.id] || ""}
                          onChange={(e) =>
                            setSelectedAccounts((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                          className="text-xs h-8 w-40"
                        >
                          <option value="">Select account...</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.currency})
                            </option>
                          ))}
                        </Select>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCommitTransaction(t)}
                          disabled={isActing}
                          className="h-8 gap-1.5 text-xs font-medium"
                          title="Import into account"
                        >
                          {isActing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                          Import
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDismissTransaction(t.id)}
                          disabled={isActing}
                          className="h-8 gap-1 text-xs text-text-muted hover:text-danger hover:border-danger/30 hover:bg-danger-subtle transition-colors"
                          title="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Documents Content */}
        {activeTab === "documents" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-muted/40 p-3 rounded-xl border border-border-subtle">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-text-primary">
                <Checkbox
                  checked={documents.length > 0 && selectedDocIds.size === documents.length}
                  onChange={toggleSelectAllDocs}
                  disabled={documents.length === 0}
                />
                <span>Select all ({documents.length})</span>
              </label>

              {selectedDocIds.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-150">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md">
                    {selectedDocIds.size} selected
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleImportSelectedDocuments}
                    disabled={Boolean(docBulkBusy)}
                  >
                    {docBulkBusy === "import" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Import Selected ({selectedDocIds.size})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDismissSelectedDocuments}
                    disabled={Boolean(docBulkBusy)}
                  >
                    {docBulkBusy === "dismiss" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Dismiss Selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDocIds(new Set())}
                    disabled={Boolean(docBulkBusy)}
                  >
                    Clear
                  </Button>
                </div>
              ) : (
                documents.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleImportAllDocuments}
                    disabled={Boolean(docBulkBusy)}
                  >
                    {docBulkBusy === "import" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Import All ({documents.length})
                  </Button>
                )
              )}
            </div>

            {docLoading ? (
              <div className="card p-8 flex items-center justify-center text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading document discoveries...
              </div>
            ) : documents.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-6 w-6" />}
                title="No pending documents"
                description="Scan your inboxes to discover bills, insurance policy papers, receipts, and tax certificates."
              />
            ) : (
              <div className="space-y-3">
                {documents.map((d) => {
                  const isActing = docActingId === d.id;
                  const isSelected = selectedDocIds.has(d.id);
                  return (
                    <Card
                      key={d.id}
                      className={`feed-item p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                        isSelected ? "border-brand ring-1 ring-brand/20 bg-brand/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleSelectDoc(d.id)}
                          className="mt-2.5 shrink-0"
                          aria-label={`Select ${d.documentTitle}`}
                        />

                        <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4" />
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-text-primary truncate">
                              {d.documentTitle}
                            </span>
                            <Badge variant="default">{d.documentType}</Badge>
                            {d.expiryDate && (
                              <Badge variant="warning">
                                Expires {new Date(d.expiryDate).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs text-text-muted truncate">
                            {d.fromAddress} • Received {new Date(d.receivedAt).toLocaleDateString()}
                            {d.filename ? ` • Attachment: ${d.filename}` : ""}
                          </p>

                          {d.aiReason && (
                            <p className="text-[11px] text-text-muted italic truncate">
                              AI: {d.aiReason} ({(Number(d.aiConfidence || 0) * 100).toFixed(0)}%)
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                        <FolderTreeSelect
                          folders={folders}
                          value={selectedFolders[d.id] || ""}
                          onChange={(id) =>
                            setSelectedFolders((prev) => ({
                              ...prev,
                              [d.id]: id,
                            }))
                          }
                          rootOptionLabel="Default folder (Root)"
                          size="sm"
                          className="w-48"
                        />

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleImportDocument(d)}
                          disabled={isActing}
                          className="h-8 gap-1.5 text-xs font-medium"
                        >
                          {isActing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                          )}
                          Import to Vault
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDismissDocument(d.id)}
                          disabled={isActing}
                          className="h-8 gap-1 text-xs text-text-muted hover:text-danger hover:border-danger/30 hover:bg-danger-subtle transition-colors"
                          title="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Reminders Content */}
        {activeTab === "reminders" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-muted/40 p-3 rounded-xl border border-border-subtle">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-text-primary">
                <Checkbox
                  checked={reminders.length > 0 && selectedRemIds.size === reminders.length}
                  onChange={toggleSelectAllReminders}
                  disabled={reminders.length === 0}
                />
                <span>Select all ({reminders.length})</span>
              </label>

              {selectedRemIds.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-150">
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md">
                    {selectedRemIds.size} selected
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleImportSelectedReminders}
                    disabled={Boolean(remBulkBusy)}
                  >
                    {remBulkBusy === "import" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Add Selected ({selectedRemIds.size})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDismissSelectedReminders}
                    disabled={Boolean(remBulkBusy)}
                  >
                    {remBulkBusy === "dismiss" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Dismiss Selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRemIds(new Set())}
                    disabled={Boolean(remBulkBusy)}
                  >
                    Clear
                  </Button>
                </div>
              ) : (
                reminders.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleImportAllReminders}
                    disabled={Boolean(remBulkBusy)}
                  >
                    {remBulkBusy === "import" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    )}
                    Add All to Reminders ({reminders.length})
                  </Button>
                )
              )}
            </div>

            {remLoading ? (
              <div className="card p-8 flex items-center justify-center text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading reminder discoveries...
              </div>
            ) : reminders.length === 0 ? (
              <EmptyState
                icon={<BellRing className="h-6 w-6" />}
                title="No pending reminders"
                description="Scan your inboxes to automatically detect upcoming bill due dates and subscription renewals."
              />
            ) : (
              <div className="space-y-3">
                {reminders.map((r) => {
                  const isActing = remActingId === r.id;
                  const isSelected = selectedRemIds.has(r.id);
                  const dueDate = new Date(r.dueAt);
                  const isOverdue = dueDate.getTime() < now;

                  return (
                    <Card
                      key={r.id}
                      className={`feed-item p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                        isSelected ? "border-brand ring-1 ring-brand/20 bg-brand/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleSelectReminder(r.id)}
                          className="mt-2.5 shrink-0"
                          aria-label={`Select ${r.title}`}
                        />

                        <div
                          className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isOverdue
                              ? "bg-red-500/10 text-red-600"
                              : "bg-amber-500/10 text-amber-600"
                          }`}
                        >
                          <Clock3 className="h-4 w-4" />
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-text-primary truncate">
                              {r.title}
                            </span>
                            <Badge variant={isOverdue ? "danger" : "warning"}>{r.category}</Badge>
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                              Due: {dueDate.toLocaleDateString()}
                            </span>
                          </div>

                          <p className="text-xs text-text-muted truncate">
                            {r.description || `From ${r.fromAddress}`}
                          </p>

                          {r.aiReason && (
                            <p className="text-[11px] text-text-muted italic truncate">
                              AI: {r.aiReason} ({(Number(r.aiConfidence || 0) * 100).toFixed(0)}%)
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                        {r.amount && (
                          <span className="font-semibold text-sm text-text-primary">
                            {formatCurrency(Number(r.amount), r.currency || "INR")}
                          </span>
                        )}

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleImportReminder(r)}
                          disabled={isActing}
                          className="h-8 gap-1.5 text-xs font-medium"
                        >
                          {isActing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                          )}
                          Add to Reminders
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDismissReminder(r.id)}
                          disabled={isActing}
                          className="h-8 gap-1 text-xs text-text-muted hover:text-danger hover:border-danger/30 hover:bg-danger-subtle transition-colors"
                          title="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

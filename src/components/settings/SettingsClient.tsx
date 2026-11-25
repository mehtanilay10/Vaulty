"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, Tab } from "@/components/ui/Tabs";
import { invalidateGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";
import {
  User,
  Shield,
  Cloud,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Unplug,
  AlertTriangle,
  Sparkles,
  FileText,
  AlertCircle,
  HardDrive,
  Clock,
  ShieldCheck,
  Download,
  Edit3,
  Folder,
  Trash2,
  Import,
  AlertOctagon,
  X,
  Activity,
  Sun,
  Moon,
  Monitor,
  KeyRound,
  Bell,
  Mail,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/Switch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Blade } from "@/components/ui/Blade";
import { Input } from "@/components/ui/Input";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Label } from "@/components/ui/Label";
import { useAppLock } from "@/components/app-lock/AppLockProvider";
import { usePasswordVault } from "@/lib/password-context";
import { hashPin, wrapCryptoKey, storeWrappedVaultKey, clearWrappedVaultKey } from "@/lib/key-wrap";
import { MasterPasswordManager } from "@/components/settings/MasterPasswordManager";
import { PdfPasswordSettings } from "@/components/settings/PdfPasswordSettings";
import { createRequestCache } from "@/lib/request-cache";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import type {
  User as UserType,
  SyncEventWithDocument,
  AiProcessingWithDocument,
  StorageConnection,
} from "@/types";

const metricTones = {
  brand: "border-brand/15 bg-brand-subtle text-brand",
  success: "border-success/20 bg-success-subtle text-success",
  warning: "border-warning/25 bg-warning-subtle text-warning",
  danger: "border-danger/20 bg-danger-subtle text-danger",
  info: "border-info/20 bg-info-subtle text-info",
  neutral: "border-border-subtle bg-surface-muted text-text-muted",
} as const;

function MetricTile({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: keyof typeof metricTones;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-muted/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-text-muted">{label}</p>
        {icon && (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded border ${metricTones[tone]}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xl font-semibold leading-6 text-text-primary">{value}</p>
    </div>
  );
}

function SettingsSection({
  id,
  icon,
  title,
  description,
  badge,
  children,
  className = "",
  tone = "brand",
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: "brand" | "danger";
}) {
  return (
    <section id={id} className={`card scroll-mt-20 p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
              tone === "danger"
                ? "border-danger/20 bg-danger-subtle text-danger"
                : "border-brand/15 bg-brand-subtle text-brand"
            }`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
          </div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {children}
    </section>
  );
}

export function SettingsClient({
  user,
  recentEvents = [],
  syncStats = { synced: 0, failed: 0, pending: 0 },
  recentAiProcessing = [],
  hasVault = false,
  emailSync,
  notificationPreferences,
}: {
  user: UserType;
  recentEvents?: SyncEventWithDocument[];
  syncStats?: { synced: number; failed: number; pending: number };
  recentAiProcessing?: AiProcessingWithDocument[];
  hasVault?: boolean;
  emailSync?: {
    gmail?: {
      emailAddress: string;
      status: string;
      lastSyncedAt: string | null;
      connectedAt: string;
    } | null;
    outlook?: {
      emailAddress: string;
      status: string;
      lastSyncedAt: string | null;
      connectedAt: string;
    } | null;
  };
  notificationPreferences?: {
    reminderEmailsEnabled?: boolean;
    reminderInAppEnabled?: boolean;
    pushNotificationsEnabled?: boolean;
  };
}) {
  const { toast, confirmAction } = useFeedback();
  const router = useRouter();
  const { encryptionKey, isUnlocked: vaultUnlocked } = usePasswordVault();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [processingAi, setProcessingAi] = useState(false);
  const [cleaningAi, setCleaningAi] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLockVerify, setShowLockVerify] = useState(false);
  const [verifyPinValue, setVerifyPinValue] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyingLock, setVerifyingLock] = useState(false);

  // Notification Preferences State
  const [inAppAlerts, setInAppAlerts] = useState(
    notificationPreferences?.reminderInAppEnabled ?? true,
  );
  const [emailAlerts, setEmailAlerts] = useState(
    notificationPreferences?.reminderEmailsEnabled ?? true,
  );
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Email sync state
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [syncingOutlook, setSyncingOutlook] = useState(false);
  const [disconnectingGmail, setDisconnectingGmail] = useState(false);
  const [disconnectingOutlook, setDisconnectingOutlook] = useState(false);

  const savePreferences = async (email: boolean, inApp: boolean) => {
    setEmailAlerts(email);
    setInAppAlerts(inApp);
    setSavingPreferences(true);
    try {
      const res = await fetch("/api/reminders", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ preferences: { email, inApp } }),
      });
      if (!res.ok) throw new Error("Failed to save preferences.");
      toast("Notification preferences saved.", "success");
    } catch {
      toast("Failed to save preferences. Please try again.", "error");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSyncGmail = async () => {
    setSyncingGmail(true);
    try {
      const res = await fetch("/api/integrations/gmail/sync", {
        method: "POST",
        headers: csrfHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync Gmail.");
      toast(data.message || "Gmail sync started.", "success");
      router.refresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Gmail sync failed.", "error");
    } finally {
      setSyncingGmail(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setDisconnectingGmail(true);
    try {
      const res = await fetch("/api/integrations/gmail/disconnect", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error("Failed to disconnect Gmail.");
      toast("Gmail disconnected successfully.", "success");
      router.refresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Disconnect failed.", "error");
    } finally {
      setDisconnectingGmail(false);
    }
  };

  const handleSyncOutlook = async () => {
    setSyncingOutlook(true);
    try {
      const res = await fetch("/api/integrations/outlook/sync", {
        method: "POST",
        headers: csrfHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync Outlook.");
      toast(data.message || "Outlook sync started.", "success");
      router.refresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Outlook sync failed.", "error");
    } finally {
      setSyncingOutlook(false);
    }
  };

  const handleDisconnectOutlook = async () => {
    setDisconnectingOutlook(true);
    try {
      const res = await fetch("/api/integrations/outlook/disconnect", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error("Failed to disconnect Outlook.");
      toast("Outlook disconnected successfully.", "success");
      router.refresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Disconnect failed.", "error");
    } finally {
      setDisconnectingOutlook(false);
    }
  };

  // App Lock PIN configuration modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  const [activeTab, setActiveTab] = useState<"profile" | "security" | "drive" | "ai" | "danger">(
    "profile",
  );
  const { theme, resolvedTheme, setTheme } = useTheme();

  const {
    enabled: appLockEnabled,
    setEnabled: setAppLockEnabled,
    hasPin: appLockHasPin,
    hasPasskey: appLockHasPasskey,
    unlockWithPin: appLockUnlockWithPin,
    unlockWithWebAuthn: appLockUnlockWithWebAuthn,
    setupPin: appLockSetupPin,
    clearPin: appLockClearPin,
    clearPasskey: appLockClearPasskey,
    clearAllAppLock: appLockClearAll,
  } = useAppLock();

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4) {
      setPinError("PIN must be exactly 4 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("PINs do not match. Please verify.");
      return;
    }
    setSavingPin(true);
    setPinError(null);
    try {
      await appLockSetupPin(newPin);
      // If the vault is unlocked in memory, wrap the key and sync across devices
      if (vaultUnlocked && encryptionKey) {
        const pinHash = await hashPin(newPin);
        const wrapped = await wrapCryptoKey(pinHash, encryptionKey);
        storeWrappedVaultKey(wrapped);
        await fetch("/api/user/app-lock", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ wrappedKey: wrapped }),
        }).catch(() => {});
      } else {
        clearWrappedVaultKey();
      }
      setShowPinModal(false);
      setNewPin("");
      setConfirmPin("");
      toast("PIN saved and synced across your devices.", "success");
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Failed to set PIN.");
    } finally {
      setSavingPin(false);
    }
  };

  const handleClearPin = async () => {
    const ok = await confirmAction({
      title: "Remove App Lock PIN?",
      description:
        "This will remove your 4-digit PIN from this device and your cloud account. You can configure a new PIN at any time.",
      confirmLabel: "Remove PIN",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await appLockClearPin();
      toast("App Lock PIN removed successfully.", "success");
    } catch {
      toast("Failed to remove PIN.", "error");
    }
  };

  const handleClearPasskey = async () => {
    const ok = await confirmAction({
      title: "Remove Passkey / Biometrics?",
      description: "This will remove the registered passkey authentication on this device.",
      confirmLabel: "Remove Passkey",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await appLockClearPasskey();
      toast("Passkey removed from this device.", "success");
    } catch {
      toast("Failed to remove passkey.", "error");
    }
  };

  const handleClearAllAppLock = async () => {
    const ok = await confirmAction({
      title: "Reset All App Lock Data?",
      description:
        "This will remove your PIN, passkeys, and wrapped convenience keys across all your devices.",
      confirmLabel: "Reset App Lock",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await appLockClearAll();
      toast("All App Lock data reset successfully.", "success");
    } catch {
      toast("Failed to reset App Lock.", "error");
    }
  };

  const handleAppLockToggle = (next: boolean) => {
    if (next) {
      // Enabling: if no method is set the provider will surface the setup flow.
      setAppLockEnabled(true);
      return;
    }
    // Disabling requires confirming with an existing method.
    if (!(appLockHasPin || appLockHasPasskey)) {
      setAppLockEnabled(false);
      return;
    }
    setVerifyError(null);
    setVerifyPinValue("");
    setShowLockVerify(true);
  };

  const confirmDisableWithPin = async () => {
    setVerifyingLock(true);
    try {
      if (verifyPinValue.length !== 4) {
        setVerifyError("Enter your 4-digit PIN to confirm.");
        return;
      }
      const ok = await appLockUnlockWithPin(verifyPinValue);
      if (ok) {
        setAppLockEnabled(false);
        setShowLockVerify(false);
        setVerifyPinValue("");
        return;
      }
      setVerifyError("Incorrect PIN. Please try again.");
    } finally {
      setVerifyingLock(false);
    }
  };

  const confirmDisableWithPasskey = async () => {
    setVerifyingLock(true);
    try {
      const ok = await appLockUnlockWithWebAuthn();
      if (ok) {
        setAppLockEnabled(false);
        setShowLockVerify(false);
        return;
      }
      setVerifyError("Passkey verification failed. Please try again.");
    } finally {
      setVerifyingLock(false);
    }
  };
  const [connection, setConnection] = useState<StorageConnection | null>(null);
  const [stats, setStats] = useState<{
    totalFolders: number;
    totalDocuments: number;
    aiProcessed: number;
    aiQueued: number;
    aiProcessing: number;
    aiFailed: number;
    aiUnprocessed: number;
    worker?: {
      queued: number;
      processing: number;
      failed: number;
      retrying: number;
      oldestQueuedAt: string | null;
      avgProcessingTimeSeconds: number;
      successRate: number;
    };
  } | null>(null);
  const [showSyncActivity, setShowSyncActivity] = useState(false);
  const [showAiActivity, setShowAiActivity] = useState(false);
  const [securityEvents, setSecurityEvents] = useState<
    { id: string; action: string; createdAt: string; source: string }[]
  >([]);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showDeleteDriveDocsModal, setShowDeleteDriveDocsModal] = useState(false);
  const [showCleaningAiModal, setShowCleaningAiModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletingDriveDocs, setDeletingDriveDocs] = useState(false);
  const [isDownloadingTakeout, setIsDownloadingTakeout] = useState(false);

  const fetchConnectionStatus = async () => {
    try {
      const res = await fetch("/api/integrations/google-drive/status");
      if (res.ok) {
        const data = await res.json();
        setConnection(data.connection);
      }
    } catch (err) {
      console.error("Failed to fetch connection status:", err);
    }
  };

  const fetchStats = async () => {
    try {
      const cachedFetch = createRequestCache(async () => {
        const res = await fetch("/api/user/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        return res.json();
      }, "user-stats");
      const data = await cachedFetch();
      setStats(data as Parameters<typeof setStats>[0]);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void fetchConnectionStatus();
      void fetchStats();
      void fetch("/api/user/audit-logs?limit=10")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.events) setSecurityEvents(data.events);
        })
        .catch(() => {});
    });
  }, []);

  const handleRevokeSessions = async () => {
    if (
      !(await confirmAction({
        title: "Sign out all sessions?",
        description:
          "Every signed-in device, including this one, will be signed out. You will need to sign in again.",
        confirmLabel: "Sign out all",
        tone: "danger",
      }))
    )
      return;
    setRevokingSessions(true);
    try {
      const response = await fetch("/api/user/sessions/revoke", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!response.ok) throw new Error("Could not revoke sessions.");
      await signOut({ callbackUrl: "/auth/signin?reason=sessions-revoked" });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not revoke sessions.");
    } finally {
      setRevokingSessions(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/integrations/google-drive/connect");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect.");
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect Google Drive.";
      setErrorMessage(message);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/integrations/google-drive/disconnect", {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error("Failed to disconnect.");
      setConnection(null);
      invalidateGoogleDriveStatus();
      setStatusMessage("Google Drive disconnected successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to disconnect Google Drive.";
      setErrorMessage(message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/integrations/google-drive/sync", {
        method: "POST",
        headers: csrfHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      setStatusMessage(
        `Sync completed: ${data.result.documentsProcessed} documents, ${data.result.foldersProcessed} folders processed.`,
      );
      fetchConnectionStatus();
      fetchStats();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed.";
      setErrorMessage(message);
    } finally {
      setSyncing(false);
    }
  };

  const handleBatchAi = async (targetStatus: "FAILED" | "PENDING" | "ALL") => {
    setProcessingAi(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/documents/ai/batch", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch AI processing failed.");
      setStatusMessage(
        `Queued ${data.queued} documents. (${data.alreadyQueued} already queued, ${data.alreadyProcessing} processing, ${data.skipped} skipped)`,
      );
      fetchStats();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch AI processing failed.";
      setErrorMessage(message);
    } finally {
      setProcessingAi(false);
    }
  };

  const handleCleanupAi = async () => {
    setCleaningAi(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/cleanup-ai", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI cleanup failed.");
      setStatusMessage(data.message || "AI processing data cleaned up.");
      fetchStats();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI cleanup failed.";
      setErrorMessage(message);
    } finally {
      setCleaningAi(false);
    }
  };

  const handleQueueAllAi = async () => {
    setProcessingAi(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/documents/ai/batch", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "ALL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch AI processing failed.");
      setStatusMessage(
        `Queued ${data.queued} documents. (${data.alreadyQueued} already queued, ${data.alreadyProcessing} processing, ${data.skipped} skipped)`,
      );
      fetchStats();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch AI processing failed.";
      setErrorMessage(message);
    } finally {
      setProcessingAi(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/user/account", { method: "DELETE", headers: csrfHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account.");
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete account.";
      setErrorMessage(message);
      setDeletingAccount(false);
    }
  };

  const handleDeleteDriveDocs = async () => {
    setDeletingDriveDocs(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/user/drive-docs", {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete Drive documents.");
      setStatusMessage(
        `Deleted ${data.counts?.files ?? 0} documents and ${data.counts?.folders ?? 0} folders from Google Drive.`,
      );
      setShowDeleteDriveDocsModal(false);
      fetchConnectionStatus();
      fetchStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete Drive documents.";
      setErrorMessage(message);
    } finally {
      setDeletingDriveDocs(false);
    }
  };

  const handleDownloadTakeout = async () => {
    setIsDownloadingTakeout(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const res = await fetch("/api/user/takeout");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate account takeout");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vaulty-takeout-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatusMessage("Account archive downloaded successfully.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to export account archive.");
    } finally {
      setIsDownloadingTakeout(false);
    }
  };

  const isConnected = connection && connection.status === "CONNECTED";

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case "UPLOAD":
        return <FileText className="w-4 h-4" />;
      case "DOWNLOAD":
        return <Download className="w-4 h-4" />;
      case "UPDATE":
        return <Edit3 className="w-4 h-4" />;
      case "RENAME":
        return <Edit3 className="w-4 h-4" />;
      case "MOVE":
        return <Folder className="w-4 h-4" />;
      case "DELETE":
        return <Trash2 className="w-4 h-4" />;
      case "IMPORT":
        return <Import className="w-4 h-4" />;
      case "CONFLICT":
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getOperationLabel = (operation: string) => {
    const labels: Record<string, string> = {
      UPLOAD: "Uploaded to Drive",
      DOWNLOAD: "Downloaded from Drive",
      UPDATE: "Updated",
      RENAME: "Renamed",
      MOVE: "Moved",
      DELETE: "Deleted",
      IMPORT: "Imported from Drive",
      CONFLICT: "Conflict detected",
    };
    return labels[operation] || operation;
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "security", label: "Security", icon: ShieldCheck },
    { id: "drive", label: "Cloud & Email Sync", icon: Cloud },
    { id: "ai", label: "AI Summary", icon: Sparkles },
    { id: "danger", label: "Danger zone", icon: AlertOctagon },
  ] as const;

  return (
    <>
      <PageHeader title="Settings" icon={<User className="h-5 w-5" />} />

      {/* Tab bar for switching tabs — mobile/tablet only; desktop uses sidebar */}
      <div className="mb-6 border-b border-border-subtle xl:hidden">
        <Tabs
          value={activeTab}
          onValueChange={(val) =>
            setActiveTab(val as "profile" | "security" | "drive" | "ai" | "danger")
          }
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Tab
                key={tab.id}
                value={tab.id}
                active={isActive}
                onClick={() => setActiveTab(tab.id)}
                icon={<Icon className="h-4 w-4" />}
              >
                {tab.label}
              </Tab>
            );
          })}
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <nav className="sticky top-20 space-y-1 rounded-lg border border-border-subtle bg-surface p-2 shadow-fluent-2">
            <p className="section-eyebrow px-2 pb-1.5 pt-1">Settings</p>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors text-left",
                    isActive
                      ? "bg-brand-subtle text-brand font-semibold"
                      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-brand" : "text-text-muted")} />
                  <span>{tab.label}</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 max-w-4xl space-y-5">
          {statusMessage && (
            <Alert variant="success">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{statusMessage}</span>
            </Alert>
          )}

          {errorMessage && (
            <Alert variant="danger">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMessage}</span>
            </Alert>
          )}

          {/* 1. Profile Tab */}
          {activeTab === "profile" && (
            <>
              <SettingsSection
                id="identity"
                icon={<Shield className="h-4 w-4" />}
                title="Profile identity"
                description="Your authenticated account details."
              >
                <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-muted p-4 sm:flex-row sm:items-center">
                  <UserAvatar src={user?.image} name={user?.name} email={user?.email} size="xl" />
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-text-primary">
                      {user?.name || "Standard User"}
                    </h3>
                    <p className="truncate text-[13px] text-text-secondary">{user?.email}</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Authenticated standard user
                    </span>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                id="theme"
                icon={<Sun className="h-4 w-4" />}
                title="Appearance & Theme"
                description="Customize your interface brightness and color mode."
              >
                <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-text-primary">Theme mode</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Select Light, Dark, or System mode to match your preferred interface style.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTheme("light");
                        try {
                          localStorage.setItem("theme", "light");
                          document.documentElement.classList.remove("dark");
                          document
                            .querySelector('meta[name="color-scheme"]')
                            ?.setAttribute("content", "light");
                        } catch {}
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                        theme === "light" || (!theme && resolvedTheme === "light")
                          ? "bg-brand text-white shadow-fluent-2"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
                      )}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTheme("dark");
                        try {
                          localStorage.setItem("theme", "dark");
                          document.documentElement.classList.add("dark");
                          document
                            .querySelector('meta[name="color-scheme"]')
                            ?.setAttribute("content", "dark");
                        } catch {}
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                        theme === "dark"
                          ? "bg-brand text-white shadow-fluent-2"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
                      )}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      <span>Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTheme("system");
                        try {
                          localStorage.removeItem("theme");
                          const prefersDark = window.matchMedia(
                            "(prefers-color-scheme: dark)",
                          ).matches;
                          if (prefersDark) {
                            document.documentElement.classList.add("dark");
                          } else {
                            document.documentElement.classList.remove("dark");
                          }
                          document
                            .querySelector('meta[name="color-scheme"]')
                            ?.setAttribute("content", "light dark");
                        } catch {}
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                        theme === "system"
                          ? "bg-brand text-white shadow-fluent-2"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
                      )}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      <span>System</span>
                    </button>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                id="notifications"
                icon={<Bell className="h-4 w-4" />}
                title="Notification Channels"
                description="Choose how Vaulty alerts you about document expiry, wealth due dates, and reminders."
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-muted p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-text-muted">
                        <Smartphone className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-text-primary">
                          In-app notifications
                        </p>
                        <p className="text-[11px] text-text-muted">
                          Deliver alert cards to your notification bell.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={inAppAlerts}
                      onChange={(checked) => savePreferences(emailAlerts, checked)}
                      disabled={savingPreferences}
                      aria-label="In-app notifications"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-muted p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-text-muted">
                        <Mail className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-text-primary">Email alerts</p>
                        <p className="text-[11px] text-text-muted">
                          Send reminders and expiry alerts to {user.email}.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={emailAlerts}
                      onChange={(checked) => savePreferences(checked, inAppAlerts)}
                      disabled={savingPreferences}
                      aria-label="Email alerts"
                    />
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                id="takeout"
                icon={<Download className="h-4 w-4" />}
                title="Account Takeout & Data Export"
                description="Download a full archive of your documents, wealth accounts and transactions, encrypted credentials, reminders, and audit history."
              >
                <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-[13px] font-semibold text-text-primary">
                      Download full data archive (.zip)
                    </p>
                    <p className="text-xs text-text-muted">
                      Generates a structured ZIP containing original documents, CSVs for wealth
                      transactions, JSON for reminders and document metadata, and your client-side
                      encrypted credential envelopes.
                    </p>
                  </div>
                  <Button
                    onClick={handleDownloadTakeout}
                    disabled={isDownloadingTakeout}
                    className="shrink-0"
                  >
                    {isDownloadingTakeout ? (
                      <LoadingSpinner className="w-4 h-4 mr-2" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    {isDownloadingTakeout ? "Exporting Data..." : "Export All Data (.zip)"}
                  </Button>
                </div>
              </SettingsSection>
            </>
          )}

          {/* Security: app lock, master password, sessions and audit activity. */}
          {activeTab === "security" && (
            <>
              <SettingsSection
                id="app-lock"
                icon={<ShieldCheck className="h-4 w-4" />}
                title="App lock"
                description="Require a PIN or passkey to open Vaulty."
                badge={
                  <Badge variant={appLockEnabled ? "success" : "default"}>
                    {appLockEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                }
              >
                <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-text-primary">
                      Lock when opened or after inactivity
                    </p>
                    <p className="mt-0.5 max-w-lg text-xs text-text-muted">
                      Requires your 4-digit PIN or biometric passkey to open Vaulty. Works
                      seamlessly across both mobile and desktop.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant={appLockHasPin ? "success" : "default"}>
                        PIN {appLockHasPin ? "set (synced across devices)" : "not set"}
                      </Badge>
                      <Badge variant={appLockHasPasskey ? "success" : "default"}>
                        Passkey {appLockHasPasskey ? "configured" : "not set"}
                      </Badge>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={appLockEnabled}
                    aria-label="Toggle app lock"
                    onClick={() => handleAppLockToggle(!appLockEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                      appLockEnabled ? "border-brand bg-brand" : "border-border bg-surface-elevated"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full shadow-fluent-2 transition-transform ${
                        appLockEnabled ? "translate-x-6 bg-white" : "translate-x-1 bg-text-muted"
                      }`}
                    />
                  </button>
                </div>

                {/* App lock credential management and cleanup */}
                <div className="mt-3 flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant={appLockHasPin ? "secondary" : "primary"}
                    onClick={() => {
                      setPinError(null);
                      setNewPin("");
                      setConfirmPin("");
                      setShowPinModal(true);
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {appLockHasPin ? "Change PIN" : "Set 4-digit PIN"}
                  </Button>
                  {appLockHasPin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger/10 hover:text-danger"
                      onClick={handleClearPin}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove PIN
                    </Button>
                  )}
                  {appLockHasPasskey && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger/10 hover:text-danger"
                      onClick={handleClearPasskey}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove passkey
                    </Button>
                  )}
                  {(appLockHasPin || appLockHasPasskey) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-subtle hover:text-danger font-medium ml-auto"
                      onClick={handleClearAllAppLock}
                    >
                      Reset all App Lock
                    </Button>
                  )}
                </div>
              </SettingsSection>

              <SettingsSection
                id="master-password"
                icon={<KeyRound className="h-4 w-4" />}
                title="Master password"
                description="Manage the key that encrypts your credential vault."
                badge={
                  <Badge variant={hasVault ? "success" : "default"}>
                    {hasVault ? "Configured" : "Not set up"}
                  </Badge>
                }
              >
                <MasterPasswordManager hasVault={hasVault} />
              </SettingsSection>

              <SettingsSection
                id="pdf-passwords"
                icon={<KeyRound className="h-4 w-4" />}
                title="Financial PDF password templates"
                description="Store encrypted personal values and institution-specific password patterns for statement attachments."
              >
                <PdfPasswordSettings />
              </SettingsSection>

              <SettingsSection
                id="sessions"
                icon={<ShieldCheck className="h-4 w-4" />}
                title="Active sessions"
                description="Invalidate all currently signed-in devices if you suspect unauthorized access."
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-secondary">
                    Vaulty uses secure account sessions. Revoking sessions signs out every device,
                    including this one.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={handleRevokeSessions}
                    disabled={revokingSessions}
                  >
                    {revokingSessions ? "Revoking…" : "Sign out all sessions"}
                  </Button>
                </div>
              </SettingsSection>

              <SettingsSection
                id="security-activity"
                icon={<Activity className="h-4 w-4" />}
                title="Security activity"
                description="Recent account and credential-vault events."
              >
                {securityEvents.length ? (
                  <div className="divide-y divide-border-subtle">
                    {securityEvents.map((event) => (
                      <div
                        key={`${event.source}-${event.id}`}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {event.action.replaceAll("_", " ").toLowerCase()}
                          </p>
                          <p className="text-xs text-text-muted">
                            {event.source === "CREDENTIALS" ? "Credential vault" : "Account"}
                          </p>
                        </div>
                        <time className="shrink-0 text-xs text-text-muted">
                          {new Date(event.createdAt).toLocaleString()}
                        </time>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">No security activity recorded yet.</p>
                )}
              </SettingsSection>
            </>
          )}

          {/* 2. Google Drive Tab */}
          {activeTab === "drive" && (
            <>
              <SettingsSection
                id="storage"
                icon={<Cloud className="h-4 w-4" />}
                title="Google Drive"
                description="Store and sync your vault directly in Google Drive."
                badge={
                  <Badge variant={isConnected ? "success" : "default"}>
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-success" : "bg-text-muted"}`}
                    />
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                }
              >
                {isConnected ? (
                  <div className="space-y-4">
                    <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-muted">
                      <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                        <span className="text-text-muted">Root folder</span>
                        <span className="truncate font-mono text-text-secondary">
                          {connection.rootFolderId || "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                        <span className="text-text-muted">Docs folder</span>
                        <span className="truncate font-mono text-text-secondary">
                          {connection.docsFolderId || "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                        <span className="text-text-muted">Last sync</span>
                        <span className="text-text-secondary">
                          {connection.lastSyncedAt
                            ? new Date(connection.lastSyncedAt).toLocaleString()
                            : "Never"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://drive.google.com/drive/folders/${connection.docsFolderId || connection.rootFolderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary h-9 px-3.5 text-[13px]"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>Open Drive</span>
                      </a>

                      <Button variant="danger" onClick={handleDisconnect} disabled={disconnecting}>
                        {disconnecting ? (
                          <LoadingSpinner className="w-4 h-4" />
                        ) : (
                          <Unplug className="w-4 h-4" />
                        )}
                        {disconnecting ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-text-secondary">
                      Connect your Google Drive to store documents directly in your Drive. Vaulty
                      will create a Vaulty folder with Docs, Summary, and Text subfolders.
                    </p>
                    <Button onClick={handleConnect} disabled={connecting}>
                      {connecting ? (
                        <LoadingSpinner className="w-4 h-4" />
                      ) : (
                        <Cloud className="w-4 h-4" />
                      )}
                      {connecting ? "Connecting..." : "Connect Google Drive"}
                    </Button>
                  </div>
                )}
              </SettingsSection>

              <SettingsSection
                id="sync-status"
                icon={<HardDrive className="h-4 w-4" />}
                title="Sync status"
                description="Google Drive activity for your vault."
                badge={
                  <Badge variant={isConnected ? "success" : "default"}>
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-success" : "bg-text-muted"}`}
                    />
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                }
              >
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <MetricTile
                    label="Synced"
                    value={syncStats.synced}
                    tone="success"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  />
                  <MetricTile
                    label="Pending"
                    value={syncStats.pending}
                    tone="warning"
                    icon={<Clock className="h-3.5 w-3.5" />}
                  />
                  <MetricTile
                    label="Failed"
                    value={syncStats.failed}
                    tone="danger"
                    icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  />
                  <MetricTile
                    label="Conflicts"
                    value={recentEvents.filter((e) => e.operation === "CONFLICT").length}
                    tone="brand"
                    icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button onClick={handleSync} disabled={syncing || !isConnected}>
                    {syncing ? (
                      <LoadingSpinner className="w-4 h-4" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {syncing ? "Syncing..." : "Sync now"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowSyncActivity(true)}
                    disabled={recentEvents.length === 0}
                  >
                    <Clock className="w-4 h-4" />
                    View recent activity
                  </Button>
                </div>
              </SettingsSection>

              {/* Gmail Sync Details */}
              <SettingsSection
                id="gmail-sync"
                icon={<Mail className="h-4 w-4" />}
                title="Gmail Financial Sync"
                description="Automatically parses bank statements and transaction emails from your Gmail inbox."
                badge={
                  <Badge variant={emailSync?.gmail?.status === "CONNECTED" ? "success" : "default"}>
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        emailSync?.gmail?.status === "CONNECTED" ? "bg-success" : "bg-text-muted"
                      }`}
                    />
                    {emailSync?.gmail?.status === "CONNECTED" ? "Connected" : "Disconnected"}
                  </Badge>
                }
              >
                {emailSync?.gmail?.status === "CONNECTED" ? (
                  <div className="space-y-4">
                    <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-muted">
                      <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                        <span className="text-text-muted">Connected Account</span>
                        <span className="font-medium text-text-primary">
                          {emailSync.gmail.emailAddress}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                        <span className="text-text-muted">Last Synced</span>
                        <span className="text-text-secondary">
                          {emailSync.gmail.lastSyncedAt
                            ? new Date(emailSync.gmail.lastSyncedAt).toLocaleString()
                            : "Never"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={handleSyncGmail} disabled={syncingGmail}>
                        {syncingGmail ? (
                          <LoadingSpinner className="w-4 h-4 mr-1.5" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-1.5" />
                        )}
                        {syncingGmail ? "Syncing..." : "Sync Gmail"}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={handleDisconnectGmail}
                        disabled={disconnectingGmail}
                      >
                        <Unplug className="w-4 h-4 mr-1.5" />
                        Disconnect
                      </Button>

                      <Link
                        href="/email-sync"
                        className="btn btn-ghost text-xs text-brand hover:underline ml-auto"
                      >
                        View email discoveries &rarr;
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-text-muted leading-relaxed">
                      Connect your Gmail account with read-only access to auto-import transactions
                      and password-protected PDF statements.
                    </p>
                    <a
                      href="/api/integrations/gmail/connect"
                      className="btn btn-primary inline-flex items-center gap-1.5"
                    >
                      <Mail className="w-4 h-4" />
                      Connect Gmail
                    </a>
                  </div>
                )}
              </SettingsSection>

              {/* Outlook Sync Details */}
              <SettingsSection
                id="outlook-sync"
                icon={<Mail className="h-4 w-4" />}
                title="Outlook Financial Sync"
                description="Automatically parses bank statements and transaction emails from your Outlook inbox."
                badge={
                  <Badge
                    variant={emailSync?.outlook?.status === "CONNECTED" ? "success" : "default"}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        emailSync?.outlook?.status === "CONNECTED" ? "bg-success" : "bg-text-muted"
                      }`}
                    />
                    {emailSync?.outlook?.status === "CONNECTED" ? "Connected" : "Disconnected"}
                  </Badge>
                }
              >
                {emailSync?.outlook?.status === "CONNECTED" ? (
                  <div className="space-y-4">
                    <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-muted">
                      <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                        <span className="text-text-muted">Connected Account</span>
                        <span className="font-medium text-text-primary">
                          {emailSync.outlook.emailAddress}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                        <span className="text-text-muted">Last Synced</span>
                        <span className="text-text-secondary">
                          {emailSync.outlook.lastSyncedAt
                            ? new Date(emailSync.outlook.lastSyncedAt).toLocaleString()
                            : "Never"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={handleSyncOutlook} disabled={syncingOutlook}>
                        {syncingOutlook ? (
                          <LoadingSpinner className="w-4 h-4 mr-1.5" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-1.5" />
                        )}
                        {syncingOutlook ? "Syncing..." : "Sync Outlook"}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={handleDisconnectOutlook}
                        disabled={disconnectingOutlook}
                      >
                        <Unplug className="w-4 h-4 mr-1.5" />
                        Disconnect
                      </Button>

                      <Link
                        href="/email-sync"
                        className="btn btn-ghost text-xs text-brand hover:underline ml-auto"
                      >
                        View email discoveries &rarr;
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-text-muted leading-relaxed">
                      Connect your Microsoft Outlook account to sync bank transaction alerts
                      directly into your Wealth review queue.
                    </p>
                    <a
                      href="/api/integrations/outlook/connect"
                      className="btn btn-primary inline-flex items-center gap-1.5"
                    >
                      <Mail className="w-4 h-4" />
                      Connect Outlook
                    </a>
                  </div>
                )}
              </SettingsSection>
            </>
          )}

          {/* 3. AI Summary Tab */}
          {activeTab === "ai" && (
            <>
              {stats && (
                <SettingsSection
                  id="ai-summary"
                  icon={<Sparkles className="h-4 w-4" />}
                  title="AI summary"
                  description="Document interpretation coverage and batch actions."
                >
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    <MetricTile
                      label="Total docs"
                      value={stats.totalDocuments}
                      tone="brand"
                      icon={<FileText className="h-3.5 w-3.5" />}
                    />
                    <MetricTile
                      label="AI ready"
                      value={stats.aiProcessed}
                      tone="success"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    />
                    <MetricTile
                      label="Queued"
                      value={stats.aiQueued}
                      tone="info"
                      icon={<Clock className="h-3.5 w-3.5" />}
                    />
                    <MetricTile
                      label="Processing"
                      value={stats.aiProcessing}
                      tone="warning"
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                    />
                    <MetricTile
                      label="Failed"
                      value={stats.aiFailed}
                      tone="danger"
                      icon={<AlertOctagon className="h-3.5 w-3.5" />}
                    />
                    <MetricTile
                      label="Not requested"
                      value={stats.aiUnprocessed}
                      tone="neutral"
                      icon={<AlertCircle className="h-3.5 w-3.5" />}
                    />
                  </div>

                  {(stats.aiFailed > 0 || stats.aiQueued > 0 || stats.aiProcessing > 0) && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button onClick={() => handleBatchAi("ALL")} disabled={processingAi}>
                        {processingAi ? (
                          <LoadingSpinner className="w-4 h-4" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        Process all eligible
                      </Button>
                      {stats.aiFailed > 0 && (
                        <Button
                          variant="secondary"
                          onClick={() => handleBatchAi("FAILED")}
                          disabled={processingAi}
                        >
                          {processingAi ? (
                            <LoadingSpinner className="w-4 h-4" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Retry failed AI ({stats.aiFailed})
                        </Button>
                      )}
                      {(stats.aiQueued > 0 || stats.aiProcessing > 0) && (
                        <Button
                          variant="secondary"
                          onClick={() => handleBatchAi("PENDING")}
                          disabled={processingAi}
                        >
                          {processingAi ? (
                            <LoadingSpinner className="w-4 h-4" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          Process pending AI ({stats.aiQueued + stats.aiProcessing})
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={handleQueueAllAi}
                        disabled={processingAi || cleaningAi}
                      >
                        {processingAi ? (
                          <LoadingSpinner className="w-4 h-4" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        Queue unprocessed
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setShowAiActivity(true)}
                        disabled={recentAiProcessing.length === 0}
                      >
                        <Clock className="w-4 h-4" />
                        View AI history
                      </Button>
                    </div>
                  )}
                </SettingsSection>
              )}

              {stats?.worker && (
                <SettingsSection
                  id="queue-health"
                  icon={<Activity className="h-4 w-4" />}
                  title="Queue health"
                  description="Background AI worker metrics for the processing queue."
                >
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    <MetricTile label="Queued jobs" value={stats.worker.queued} tone="info" />
                    <MetricTile label="Processing" value={stats.worker.processing} tone="warning" />
                    <MetricTile label="Failed" value={stats.worker.failed} tone="danger" />
                    <MetricTile label="Retrying" value={stats.worker.retrying} tone="warning" />
                    <MetricTile
                      label="Avg duration"
                      value={`${stats.worker.avgProcessingTimeSeconds}s`}
                    />
                    <MetricTile
                      label="Success rate"
                      value={`${(stats.worker.successRate * 100).toFixed(1)}%`}
                      tone="success"
                    />
                  </div>
                  {stats.worker.oldestQueuedAt && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
                      <Clock className="h-3.5 w-3.5" />
                      Oldest queued job: {new Date(stats.worker.oldestQueuedAt).toLocaleString()}
                    </p>
                  )}
                </SettingsSection>
              )}
            </>
          )}

          {/* 4. Danger zone Tab */}
          {activeTab === "danger" && (
            <SettingsSection
              id="danger-zone"
              icon={<AlertOctagon className="h-4 w-4" />}
              title="Danger zone"
              description="These actions are irreversible. Please proceed with caution."
              className="border-danger/30"
              tone="danger"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="danger"
                  onClick={() => setShowDeleteDriveDocsModal(true)}
                  disabled={deletingDriveDocs}
                >
                  {deletingDriveDocs ? (
                    <LoadingSpinner className="w-4 h-4" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete all Drive documents
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowCleaningAiModal(true)}
                  disabled={cleaningAi}
                >
                  {cleaningAi ? (
                    <LoadingSpinner className="w-4 h-4" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Clean up AI data
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowDeleteAccountModal(true)}
                  disabled={deletingAccount}
                >
                  {deletingAccount ? (
                    <LoadingSpinner className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  Delete account
                </Button>
              </div>
            </SettingsSection>
          )}
        </div>
      </div>

      {showSyncActivity && (
        <Blade
          open={showSyncActivity}
          onClose={() => setShowSyncActivity(false)}
          title="Recent Sync Activity"
          description="The latest changes synced with Google Drive."
          icon={<Activity className="h-4 w-4" />}
          size="md"
        >
          <div className="space-y-2">
            {recentEvents.length === 0 ? (
              <EmptyState icon={<Clock className="w-10 h-10" />} title="No sync activity yet" />
            ) : (
              recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-4 rounded-lg bg-surface-muted border border-border-subtle flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${event.status === "SUCCESS" ? "bg-success-subtle text-success" : event.status === "FAILED" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning"}`}
                    >
                      {getOperationIcon(event.operation)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary truncate max-w-xs">
                        {event.document?.name || event.folder?.name || "Unknown"}
                      </p>
                      <p className="text-xs text-text-muted">
                        {getOperationLabel(event.operation)} •{" "}
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      event.status === "SUCCESS"
                        ? "success"
                        : event.status === "FAILED"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {event.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Blade>
      )}

      {showAiActivity && (
        <Blade
          open={showAiActivity}
          onClose={() => setShowAiActivity(false)}
          title="AI Processing History"
          description="Recent document interpretation jobs and their status."
          icon={<Sparkles className="h-4 w-4" />}
          size="md"
        >
          <div className="space-y-2">
            {recentAiProcessing.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="w-10 h-10" />}
                title="No AI processing history yet"
              />
            ) : (
              recentAiProcessing.map((record) => (
                <div
                  key={record.id}
                  className="p-4 rounded-lg bg-surface-muted border border-border-subtle flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-text-primary truncate max-w-xs">
                      {record.document?.name || "Unknown Document"}
                    </p>
                    <Badge
                      variant={
                        record.status === "COMPLETED"
                          ? "success"
                          : record.status === "FAILED"
                            ? "danger"
                            : record.status === "PROCESSING"
                              ? "warning"
                              : "info"
                      }
                    >
                      {record.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted">
                    {new Date(record.createdAt).toLocaleString()}
                    {record.processedAt &&
                      ` • Completed ${new Date(record.processedAt).toLocaleString()}`}
                  </p>
                  {record.errorMessage && (
                    <p className="text-xs text-danger bg-danger-subtle/50 p-2 rounded border border-danger/20">
                      {record.errorMessage}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </Blade>
      )}

      {showDeleteAccountModal && (
        <Blade
          open={showDeleteAccountModal}
          onClose={() => setShowDeleteAccountModal(false)}
          title="Delete Account"
          description="This action permanently removes your Vaulty data."
          icon={<AlertOctagon className="h-4 w-4" />}
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowDeleteAccountModal(false)}
                disabled={deletingAccount}
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteAccount} disabled={deletingAccount}>
                {deletingAccount ? (
                  <LoadingSpinner className="w-4 h-4" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Yes, Delete Everything
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              This will permanently delete your account and all associated data from the database,
              including:
            </p>
            <ul className="text-xs text-text-secondary list-disc list-inside space-y-1">
              <li>All documents and folders</li>
              <li>AI processing records and summaries</li>
              <li>Chat history and sessions</li>
              <li>Sync events and audit logs</li>
              <li>Storage connections</li>
            </ul>
            <Alert variant="info">
              Your Google Drive files will <strong>not</strong> be affected.
            </Alert>
          </div>
        </Blade>
      )}

      {showDeleteDriveDocsModal && (
        <Blade
          open={showDeleteDriveDocsModal}
          onClose={() => setShowDeleteDriveDocsModal(false)}
          title="Delete All Drive Documents"
          description="This permanently removes Vaulty-created files from Google Drive."
          icon={<AlertOctagon className="h-4 w-4" />}
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowDeleteDriveDocsModal(false)}
                disabled={deletingDriveDocs}
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteDriveDocs} disabled={deletingDriveDocs}>
                {deletingDriveDocs ? (
                  <LoadingSpinner className="w-4 h-4" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Yes, Delete All Drive Docs
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              This will permanently delete <strong>all documents and folders</strong> from your
              Google Drive that were created by Vaulty, including:
            </p>
            <ul className="text-xs text-text-secondary list-disc list-inside space-y-1">
              <li>All uploaded documents</li>
              <li>AI-generated summaries and extracted text files</li>
              <li>Vaulty folder structure in Drive</li>
            </ul>
            <Alert variant="warning">
              This action cannot be undone. Your Vaulty account and database records will remain
              intact.
            </Alert>
          </div>
        </Blade>
      )}

      {showCleaningAiModal && (
        <Blade
          open={showCleaningAiModal}
          onClose={() => setShowCleaningAiModal(false)}
          title="Clean Up AI Data"
          description="This removes AI-generated files while keeping originals intact."
          icon={<AlertOctagon className="h-4 w-4" />}
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setShowCleaningAiModal(false)}
                disabled={cleaningAi}
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button variant="danger" onClick={handleCleanupAi} disabled={cleaningAi}>
                {cleaningAi ? (
                  <LoadingSpinner className="w-4 h-4" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Yes, Clean Up AI Data
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              This will permanently delete <strong>AI-generated documents</strong> from your Google
              Drive that were created by Vaulty.
            </p>
            <ul className="text-xs text-text-secondary list-disc list-inside space-y-1">
              <li>AI-generated summaries and extracted text files</li>
              <li>And update all documents to stop using AI features</li>
            </ul>
            <Alert variant="warning">
              This action cannot be undone. Your original documents will remain intact.
            </Alert>
          </div>
        </Blade>
      )}

      <Blade
        open={showLockVerify}
        onClose={() => setShowLockVerify(false)}
        title="Confirm: Disable App Lock"
        description="Verify your identity to turn off App Lock."
        icon={<ShieldCheck className="h-4 w-4" />}
        size="sm"
        footer={
          <Button variant="ghost" onClick={() => setShowLockVerify(false)}>
            Cancel
          </Button>
        }
      >
        <div className="space-y-4">
          {verifyError && <Alert variant="danger">{verifyError}</Alert>}
          {appLockHasPin && (
            <div className="space-y-2">
              <Label>Enter your 4-digit PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={verifyPinValue}
                onChange={(e) => setVerifyPinValue(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="••••"
              />
              <Button
                variant="primary"
                className="w-full"
                disabled={verifyingLock}
                onClick={confirmDisableWithPin}
              >
                {verifyingLock ? "Verifying..." : "Verify with PIN"}
              </Button>
            </div>
          )}
          {appLockHasPasskey && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={verifyingLock}
              onClick={confirmDisableWithPasskey}
            >
              {verifyingLock ? "Verifying..." : "Verify with Passkey"}
            </Button>
          )}
        </div>
      </Blade>
      <Blade
        open={showPinModal}
        onClose={() => setShowPinModal(false)}
        title={appLockHasPin ? "Change App Lock PIN" : "Set App Lock PIN"}
        description="Your 4-digit PIN works seamlessly across all your devices (desktop and mobile)."
        icon={<ShieldCheck className="h-4 w-4" />}
        size="sm"
        footer={
          <Button variant="ghost" onClick={() => setShowPinModal(false)}>
            Cancel
          </Button>
        }
      >
        <form onSubmit={handleSavePin} className="space-y-4">
          {pinError && <Alert variant="danger">{pinError}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="settings-applock-pin">4-digit PIN</Label>
            <Input
              id="settings-applock-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="••••"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-confirm-pin">Confirm 4-digit PIN</Label>
            <Input
              id="settings-confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="••••"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={savingPin || newPin.length !== 4 || confirmPin.length !== 4}
          >
            {savingPin ? "Saving & Syncing..." : "Save PIN across devices"}
          </Button>
        </form>
      </Blade>
    </>
  );
}

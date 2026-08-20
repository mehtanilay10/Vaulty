"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import {
  User,
  Shield,
  Cloud,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
  Unplug,
  AlertTriangle,
  Sparkles,
  FolderOpen,
  FileText,
  AlertCircle,
} from "lucide-react";

export function SettingsClient({ user }: { user: any }) {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [processingAi, setProcessingAi] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connection, setConnection] = useState<any>(null);
  const [stats, setStats] = useState<{
    totalFolders: number;
    totalDocuments: number;
    aiProcessed: number;
    aiPending: number;
    aiFailed: number;
  } | null>(null);

  useEffect(() => {
    fetchConnectionStatus();
    fetchStats();
  }, []);

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
      const res = await fetch("/api/user/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
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
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to connect Google Drive.");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/integrations/google-drive/disconnect", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect.");
      setConnection(null);
      setStatusMessage("Google Drive disconnected successfully.");
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to disconnect Google Drive.");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/integrations/google-drive/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      setStatusMessage(`Sync completed: ${data.result.documentsProcessed} documents, ${data.result.foldersProcessed} folders processed.`);
      fetchConnectionStatus();
      fetchStats();
    } catch (err: any) {
      setErrorMessage(err?.message || "Sync failed.");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch AI processing failed.");
      setStatusMessage(`AI processing queued for ${data.results.length} documents.`);
      fetchStats();
    } catch (err: any) {
      setErrorMessage(err?.message || "Batch AI processing failed.");
    } finally {
      setProcessingAi(false);
    }
  };

  const isConnected = connection && connection.status === "CONNECTED";

  return (
    <AppShell>
      <PageHeader
        title="Account & Vault Settings"
        description="User identity details, security parameters, and storage allocation"
        icon={<User className="w-7 h-7" />}
      />

      <div className="max-w-3xl space-y-6">
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

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">Google OAuth Identity</h2>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg bg-surface-muted border border-border-subtle">
            {user?.image ? (
              <img src={user.image} alt="" className="w-14 h-14 rounded-lg ring-2 ring-brand/20" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-brand-subtle text-brand font-bold text-xl flex items-center justify-center">
                {user?.name?.[0] || user?.email?.[0]}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-lg text-text-primary">{user?.name || "Standard User"}</h3>
              <p className="text-sm text-text-secondary">{user?.email}</p>
              <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-success">
                <CheckCircle2 className="w-3.5 h-3.5" /> Authenticated Standard User
              </span>
            </div>
          </div>
        </Card>

        {stats && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-brand" />
              <h2 className="text-base font-semibold text-text-primary">Vault Summary</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle text-center">
                <FolderOpen className="w-5 h-5 text-brand mx-auto mb-2" />
                <p className="text-xl font-bold text-text-primary">{stats.totalFolders}</p>
                <p className="text-xs text-text-muted">Folders</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle text-center">
                <FileText className="w-5 h-5 text-brand mx-auto mb-2" />
                <p className="text-xl font-bold text-text-primary">{stats.totalDocuments}</p>
                <p className="text-xs text-text-muted">Documents</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle text-center">
                <CheckCircle2 className="w-5 h-5 text-success mx-auto mb-2" />
                <p className="text-xl font-bold text-text-primary">{stats.aiProcessed}</p>
                <p className="text-xs text-text-muted">AI Processed</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle text-center">
                <AlertCircle className="w-5 h-5 text-warning mx-auto mb-2" />
                <p className="text-xl font-bold text-text-primary">{stats.aiPending + stats.aiFailed}</p>
                <p className="text-xs text-text-muted">Pending / Failed</p>
              </div>
            </div>

            {(stats.aiFailed > 0 || stats.aiPending > 0) && (
              <div className="flex flex-wrap items-center gap-3 mt-4">
                {(stats.aiFailed > 0 || stats.aiPending > 0) && (
                  <Button
                    onClick={() => handleBatchAi("ALL")}
                    disabled={processingAi}
                  >
                    {processingAi ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Process All Pending & Failed
                  </Button>
                )}
                {stats.aiFailed > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => handleBatchAi("FAILED")}
                    disabled={processingAi}
                  >
                    {processingAi ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Retry Failed AI ({stats.aiFailed})
                  </Button>
                )}
                {stats.aiPending > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => handleBatchAi("PENDING")}
                    disabled={processingAi}
                  >
                    {processingAi ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Process Pending AI ({stats.aiPending})
                  </Button>
                )}
              </div>
            )}
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <Cloud className="w-5 h-5 text-brand" />
              <span>Google Drive</span>
            </h2>
            {isConnected ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="default">Not Connected</Badge>
            )}
          </div>

          {isConnected ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Root Folder</span>
                  <span className="text-text-secondary font-mono">{connection.rootFolderId || "—"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Docs Folder</span>
                  <span className="text-text-secondary font-mono">{connection.docsFolderId || "—"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Last Sync</span>
                  <span className="text-text-secondary">{connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "Never"}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {syncing ? "Syncing..." : "Sync Now"}
                </Button>

                <a
                  href={`https://drive.google.com/drive/folders/${connection.docsFolderId || connection.rootFolderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary h-9 px-4 text-xs sm:text-sm rounded-md"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Drive</span>
                </a>

                <Button variant="danger" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">
                Connect your Google Drive to store documents directly in your Drive. Vaulty will create a Vaulty folder with Docs, Summary, and Text subfolders.
              </p>
              <Button onClick={handleConnect} disabled={connecting}>
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                {connecting ? "Connecting..." : "Connect Google Drive"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

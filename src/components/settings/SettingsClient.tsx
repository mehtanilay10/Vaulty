"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import {
  User,
  Shield,
  Lock,
  HardDrive,
  Cloud,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
  Unplug,
  AlertTriangle,
} from "lucide-react";

export function SettingsClient({ user }: { user: any }) {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connection, setConnection] = useState<any>(null);

  useEffect(() => {
    fetchConnectionStatus();
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
    } catch (err: any) {
      setErrorMessage(err?.message || "Sync failed.");
    } finally {
      setSyncing(false);
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

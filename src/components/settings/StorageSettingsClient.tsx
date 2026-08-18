"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import {
  HardDrive,
  Cloud,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Unplug,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";

export function StorageSettingsClient({ user }: { user: { id: string; defaultStorageProvider: string; storageConnections: any[] } }) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connection, setConnection] = useState<any>(null);
  const [selectedProvider, setSelectedProvider] = useState(user.defaultStorageProvider || "GOOGLE_DRIVE");

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

  const handleProviderChange = async () => {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultStorageProvider: selectedProvider }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update provider.");
      }
      setStatusMessage("Default storage provider updated.");
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to update provider.");
      setSelectedProvider(user.defaultStorageProvider);
    }
  };

  const isConnected = connection && connection.status === "CONNECTED";

  return (
    <AppShell>
      <PageHeader
        title="Storage Settings"
        description="Manage your default storage provider and Google Drive connection"
        icon={<HardDrive className="w-7 h-7" />}
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
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2 mb-4">
            <Cloud className="w-5 h-5 text-brand" />
            <span>Default Storage for New Uploads</span>
          </h2>

          <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle">
            <p className="text-xs text-text-secondary">
              Google Drive is the default and only storage provider.
            </p>
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
                  className="btn btn-secondary text-xs"
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

        <Card>
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2 mb-4">
            <HardDrive className="w-5 h-5 text-brand" />
            <span>Storage</span>
          </h2>

          <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle">
            <p className="text-xs text-text-secondary">
              Google Drive is the active storage provider. Connect your Google Drive to store and access documents.
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

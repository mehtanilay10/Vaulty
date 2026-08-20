"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  HardDrive,
  CheckCircle2,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  FileText,
  Folder,
  ShieldCheck,
  Download,
  Edit3,
  Trash2,
  Import,
} from "lucide-react";
import { useRouter } from "next/navigation";

export function SyncCenterClient({
  connection,
  recentEvents,
  stats,
}: {
  connection: any;
  recentEvents: any[];
  stats: { synced: number; failed: number; pending: number };
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [events, setEvents] = useState(recentEvents);

  const isConnected = connection && connection.status === "CONNECTED";

  const handleSync = async () => {
    setSyncing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/integrations/google-drive/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed.");
      setSuccessMessage(`Sync completed successfully.`);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case "UPLOAD": return <FileText className="w-4 h-4" />;
      case "DOWNLOAD": return <Download className="w-4 h-4" />;
      case "UPDATE": return <Edit3 className="w-4 h-4" />;
      case "RENAME": return <Edit3 className="w-4 h-4" />;
      case "MOVE": return <Folder className="w-4 h-4" />;
      case "DELETE": return <Trash2 className="w-4 h-4" />;
      case "IMPORT": return <Import className="w-4 h-4" />;
      case "CONFLICT": return <AlertTriangle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
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

  const getTargetName = (event: any) => {
    if (event.document) return event.document.name;
    if (event.folder) return event.folder.name;
    return "Unknown";
  };

  return (
    <AppShell>
      <PageHeader
        title="Sync Center"
        description="Monitor and manage your Google Drive synchronization"
        icon={<RefreshCw className="w-7 h-7" />}
        actions={
          <Link href="/settings">
            <Button variant="secondary">
              <ShieldCheck className="w-4 h-4" />
              Storage Settings
            </Button>
          </Link>
        }
      />

      {errorMessage && (
        <Alert variant="danger">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
        </Alert>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-brand-subtle text-brand">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Google Drive</h2>
              <p className="text-xs text-text-muted">
                {isConnected ? `Connected • Last sync: ${connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "Never"}` : "Not connected"}
              </p>
            </div>
          </div>
          <Badge variant={isConnected ? "success" : "default"}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-text-muted"}`} />
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle text-center">
            <p className="text-2xl font-bold text-text-primary">{stats.synced}</p>
            <p className="text-xs text-text-muted mt-1">Synced</p>
          </div>
          <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle text-center">
            <p className="text-2xl font-bold text-text-primary">{stats.pending}</p>
            <p className="text-xs text-text-muted mt-1">Pending</p>
          </div>
          <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle text-center">
            <p className="text-2xl font-bold text-text-primary">{stats.failed}</p>
            <p className="text-xs text-text-muted mt-1">Failed</p>
          </div>
          <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle text-center">
            <p className="text-2xl font-bold text-text-primary">{events.filter((e) => e.operation === "CONFLICT").length}</p>
            <p className="text-xs text-text-muted mt-1">Conflicts</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSync} disabled={syncing || !isConnected}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Clock className="w-5 h-5 text-warning" />
          <span>Recent Activity</span>
        </h2>

        {events.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Clock className="w-10 h-10" />}
              title="No sync activity yet"
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <Card key={event.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${event.status === "SUCCESS" ? "bg-success-subtle text-success" : event.status === "FAILED" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning"}`}>
                    {getOperationIcon(event.operation)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary truncate max-w-xs">
                      {getTargetName(event)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {getOperationLabel(event.operation)} • {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Badge variant={event.status === "SUCCESS" ? "success" : event.status === "FAILED" ? "danger" : "warning"}>
                  {event.status}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import {
  HardDrive,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  FileText,
  Folder,
  Upload,
  Download,
  Edit3,
  Trash2,
  Import,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";

export function SyncCenterClient({
  user,
  connection,
  recentEvents,
  stats,
}: {
  user: { id: string; name?: string | null; email?: string | null };
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
      case "UPLOAD": return <Upload className="w-4 h-4" />;
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
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col transition-colors">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <RefreshCw className="w-7 h-7 text-accent-primary" />
              <span>Sync Center</span>
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Monitor and manage your Google Drive synchronization
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-accent-rose-soft border border-accent-rose/20 text-accent-rose text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-2xl bg-accent-emerald-soft border border-accent-emerald/20 text-accent-emerald text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="vault-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent-primary-soft text-accent-primary">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-primary">Google Drive</h2>
                  <p className="text-xs text-text-muted">
                    {isConnected ? `Connected • Last sync: ${connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "Never"}` : "Not connected"}
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${isConnected ? "bg-accent-emerald-soft text-accent-emerald border-accent-emerald/20" : "bg-bg-muted text-text-muted border-border-subtle"}`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-accent-emerald" : "bg-text-muted"}`} />
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle text-center">
                <p className="text-2xl font-bold text-text-primary">{stats.synced}</p>
                <p className="text-xs text-text-muted mt-1">Synced</p>
              </div>
              <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle text-center">
                <p className="text-2xl font-bold text-text-primary">{stats.pending}</p>
                <p className="text-xs text-text-muted mt-1">Pending</p>
              </div>
              <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle text-center">
                <p className="text-2xl font-bold text-text-primary">{stats.failed}</p>
                <p className="text-xs text-text-muted mt-1">Failed</p>
              </div>
              <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle text-center">
                <p className="text-2xl font-bold text-text-primary">{events.filter((e) => e.operation === "CONFLICT").length}</p>
                <p className="text-xs text-text-muted mt-1">Conflicts</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSync}
                disabled={syncing || !isConnected}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl vault-btn-primary text-sm disabled:opacity-50 cursor-pointer"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>{syncing ? "Syncing..." : "Sync Now"}</span>
              </button>

              <Link
                href="/settings/storage"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl vault-btn-secondary text-sm"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Storage Settings</span>
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent-secondary" />
              <span>Recent Activity</span>
            </h2>

            {events.length === 0 ? (
              <div className="vault-card p-6 text-center text-xs text-text-muted">
                No sync activity yet.
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="vault-card p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${event.status === "SUCCESS" ? "bg-accent-emerald-soft text-accent-emerald" : event.status === "FAILED" ? "bg-accent-rose-soft text-accent-rose" : "bg-accent-secondary-soft text-accent-secondary"}`}>
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
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${event.status === "SUCCESS" ? "bg-accent-emerald-soft text-accent-emerald" : event.status === "FAILED" ? "bg-accent-rose-soft text-accent-rose" : "bg-accent-secondary-soft text-accent-secondary"}`}>
                      {event.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

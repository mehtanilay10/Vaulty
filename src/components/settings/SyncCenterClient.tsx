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
  const statusColor = isConnected ? "text-emerald-400" : "text-slate-400";
  const statusBg = isConnected ? "bg-emerald-500/10 border-emerald-500/20" : "bg-slate-500/10 border-slate-500/20";
  const statusText = isConnected ? "Connected" : "Disconnected";

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
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <RefreshCw className="w-7 h-7 text-indigo-400" />
              <span>Sync Center</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Monitor and manage your Google Drive synchronization
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Connection Status Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Google Drive</h2>
                  <p className="text-xs text-slate-400">
                    {isConnected ? `Connected • Last sync: ${connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "Never"}` : "Not connected"}
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusBg} ${statusColor}`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-slate-400"}`} />
                {statusText}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
                <p className="text-2xl font-bold text-white">{stats.synced}</p>
                <p className="text-xs text-slate-400 mt-1">Synced</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
                <p className="text-2xl font-bold text-white">{stats.pending}</p>
                <p className="text-xs text-slate-400 mt-1">Pending</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
                <p className="text-2xl font-bold text-white">{stats.failed}</p>
                <p className="text-xs text-slate-400 mt-1">Failed</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
                <p className="text-2xl font-bold text-white">{events.filter((e) => e.operation === "CONFLICT").length}</p>
                <p className="text-xs text-slate-400 mt-1">Conflicts</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSync}
                disabled={syncing || !isConnected}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>{syncing ? "Syncing..." : "Sync Now"}</span>
              </button>

              <Link
                href="/settings/storage"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-medium border border-slate-200 dark:border-slate-700/80 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Storage Settings</span>
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <span>Recent Activity</span>
            </h2>

            {events.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-center text-xs text-slate-500">
                No sync activity yet.
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${event.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400" : event.status === "FAILED" ? "bg-rose-500/10 text-rose-400" : "bg-amber-500/10 text-amber-400"}`}>
                        {getOperationIcon(event.operation)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-xs">
                          {getTargetName(event)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {getOperationLabel(event.operation)} • {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${event.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400" : event.status === "FAILED" ? "bg-rose-500/10 text-rose-400" : "bg-amber-500/10 text-amber-400"}`}>
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

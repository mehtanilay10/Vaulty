"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
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
  const driveStatusColor = isConnected ? "text-emerald-400" : "text-slate-400";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <HardDrive className="w-7 h-7 text-indigo-400" />
              <span>Storage Settings</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Manage your default storage provider and Google Drive connection
            </p>
          </div>

          <div className="max-w-3xl space-y-6">
            {statusMessage && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Default Storage Provider */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-400" />
                <span>Default Storage for New Uploads</span>
              </h2>

              <div className="flex flex-col sm:flex-row gap-4">
                <label className={`flex-1 p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedProvider === "GOOGLE_DRIVE" ? "border-indigo-500 bg-indigo-500/5" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    name="storageProvider"
                    value="GOOGLE_DRIVE"
                    checked={selectedProvider === "GOOGLE_DRIVE"}
                    onChange={(e) => setSelectedProvider(e.target.value as any)}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white">Google Drive</p>
                      <p className="text-xs text-slate-500 mt-1">Store documents in your Google Drive</p>
                    </div>
                  </div>
                </label>

                <label className={`flex-1 p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedProvider === "VERCEL_BLOB" ? "border-indigo-500 bg-indigo-500/5" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    name="storageProvider"
                    value="VERCEL_BLOB"
                    checked={selectedProvider === "VERCEL_BLOB"}
                    onChange={(e) => setSelectedProvider(e.target.value as any)}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white">Vercel Blob</p>
                      <p className="text-xs text-slate-500 mt-1">Store documents in private Vercel Blob</p>
                    </div>
                  </div>
                </label>
              </div>

              <button
                onClick={handleProviderChange}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                disabled={selectedProvider === user.defaultStorageProvider}
              >
                Save Default Provider
              </button>
            </div>

            {/* Google Drive Connection */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-indigo-400" />
                  <span>Google Drive</span>
                </h2>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 text-slate-400 text-xs font-semibold border border-slate-500/20">
                    <XCircle className="w-3.5 h-3.5" />
                    Not Connected
                  </span>
                )}
              </div>

              {isConnected ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Root Folder</span>
                      <span className="text-slate-300 font-mono">{connection.rootFolderId || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Docs Folder</span>
                      <span className="text-slate-300 font-mono">{connection.docsFolderId || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Last Sync</span>
                      <span className="text-slate-300">{connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "Never"}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      <span>{syncing ? "Syncing..." : "Sync Now"}</span>
                    </button>

                    <a
                      href={`https://drive.google.com/drive/folders/${connection.docsFolderId || connection.rootFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium border border-slate-200 dark:border-slate-700/80 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open Drive</span>
                    </a>

                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                      <span>{disconnecting ? "Disconnecting..." : "Disconnect"}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Connect your Google Drive to store documents directly in your Drive. Vaulty will create a Vaulty folder with Docs, Summary, and Text subfolders.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                    <span>{connecting ? "Connecting..." : "Connect Google Drive"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Vercel Blob */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <span>Vercel Blob</span>
              </h2>

              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                <p className="text-xs text-slate-400">
                  Vercel Private Blob storage is always available as an alternative storage provider. Existing Blob documents remain accessible.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

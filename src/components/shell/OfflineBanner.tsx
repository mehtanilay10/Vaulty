"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function getOnlineServerSnapshot() {
  return true;
}

export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-14 z-40 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-800 backdrop-blur dark:text-amber-300"
    >
      <WifiOff className="h-4 w-4 shrink-0 animate-pulse text-amber-600 dark:text-amber-400" />
      <span>
        You are currently offline. Cloud sync, AI processing, and real-time updates are paused until
        connection is restored.
      </span>
    </div>
  );
}

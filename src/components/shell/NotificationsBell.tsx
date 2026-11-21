"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

const TYPE_ICONS: Record<string, React.ElementType> = {
  DOCUMENT_EXPIRY: AlertTriangle,
  REMINDER_DUE: AlertTriangle,
  WEALTH_PAYMENT_DUE: AlertTriangle,
  WEALTH_EXPIRY: AlertTriangle,
  AI_PROCESSING_FAILED: AlertTriangle,
  GOOGLE_DRIVE_DISCONNECTED: AlertTriangle,
  SYNC_CONFLICT: AlertTriangle,
  FOLDER_SHARED: CheckCircle,
  PUBLIC_SHARE_ACCESSED: CheckCircle,
  PUBLIC_SHARE_EXPIRED: AlertTriangle,
  VAULT_SHARED: CheckCircle,
  CREDENTIAL_ACCESS: AlertTriangle,
  WEALTH_TRANSACTION_AUTO_IMPORTED: CheckCircle,
  WEALTH_TRANSACTION_PENDING_REVIEW: Bell,
  WEALTH_ACCOUNT_MERGED: CheckCircle,
};

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  read: boolean;
  createdAt: string;
}

function getSafeNotificationUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    if (value.startsWith("/")) {
      const parsed = new URL(value, "https://vaulty.invalid");
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchNotifications();
    const refreshId = window.setInterval(fetchNotifications, 60_000);
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") fetchNotifications();
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(refreshId);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [fetchNotifications]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) fetchNotifications();
        }}
        className="relative flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-surface-muted text-text-secondary hover:text-text-primary"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-surface">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated shadow-fluent-16">
          <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted/70 px-3 py-2">
            <span className="text-[12px] font-medium text-text-primary">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-medium text-brand hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="divide-y divide-border-subtle p-1">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2.5 animate-pulse">
                    <div className="h-7 w-7 rounded-md bg-surface-muted shrink-0" />
                    <div className="flex-1 space-y-1.5 py-0.5">
                      <div className="h-3 w-3/4 rounded bg-surface-muted" />
                      <div className="h-2.5 w-full rounded bg-surface-muted/60" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-text-muted">No notifications yet.</p>
            )}
            {!loading &&
              notifications.map((n) => {
                const Icon = (TYPE_ICONS[n.type] ?? Bell) as React.ElementType;
                const actionUrl = getSafeNotificationUrl(n.actionUrl);
                const className = cn(
                  "flex items-start gap-2.5 border-b border-border-subtle px-3 py-2.5 last:border-0 transition-colors",
                  !n.read ? "bg-brand-subtle/10" : "bg-transparent",
                  actionUrl ? "cursor-pointer hover:bg-surface-muted" : "",
                );

                const itemContent = (
                  <>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface text-text-secondary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-text-primary">{n.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                        {n.message}
                      </p>
                      {actionUrl && (
                        <span className="mt-1 block truncate text-[11px] font-medium text-brand">
                          View details →
                        </span>
                      )}
                    </div>
                    <span suppressHydrationWarning className="shrink-0 text-[11px] text-text-muted">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </>
                );

                return actionUrl ? (
                  <Link
                    key={n.id}
                    href={actionUrl}
                    onClick={() => setOpen(false)}
                    className={className}
                  >
                    {itemContent}
                  </Link>
                ) : (
                  <div key={n.id} className={className}>
                    {itemContent}
                  </div>
                );
              })}
          </div>
          <div className="border-t border-border-subtle px-3 py-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-brand hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

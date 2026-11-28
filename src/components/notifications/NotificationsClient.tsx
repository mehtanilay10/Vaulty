"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle, AlertTriangle, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { PushNotificationSetup } from "@/components/notifications/PushNotificationSetup";
import { csrfHeaders } from "@/lib/csrf-client";

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  read: boolean;
  createdAt: string;
}

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

function formatNotificationDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return dateStr.slice(0, 10);
  }
}

export function NotificationsClient({
  initialNotifications,
}: {
  initialNotifications: NotificationDTO[];
}) {
  const [notifications, setNotifications] = useState<NotificationDTO[]>(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const markSingleRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id, read: true }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      <PushNotificationSetup />

      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          You have {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}.
        </p>

        {unreadCount > 0 && (
          <Button
            onClick={markAllRead}
            disabled={markingAll}
            variant="ghost"
            size="sm"
            className="text-xs"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 && <Alert variant="default">No notifications yet.</Alert>}

      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-xs divide-y divide-border-subtle">
        {notifications.map((notification) => {
          const Icon = (TYPE_ICONS[notification.type] ?? Bell) as React.ElementType;
          const actionUrl = getSafeNotificationUrl(notification.actionUrl);
          const cardClasses = `flex items-start gap-3.5 px-4 py-3.5 transition-colors ${
            !notification.read ? "bg-brand-subtle/35" : "bg-surface"
          } ${actionUrl ? "cursor-pointer hover:bg-surface-muted/70" : ""}`;

          const content = (
            <>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  !notification.read
                    ? "border-brand/25 bg-brand-subtle text-brand"
                    : "border-border-subtle bg-surface-muted text-text-secondary"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold text-text-primary">
                    {notification.title}
                  </p>
                  {!notification.read && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
                  {notification.message}
                </p>
              </div>
              <div
                suppressHydrationWarning
                className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted"
              >
                {formatNotificationDate(notification.createdAt)}
              </div>
            </>
          );

          return actionUrl ? (
            <Link
              key={notification.id}
              href={actionUrl}
              onClick={() => {
                if (!notification.read) {
                  markSingleRead(notification.id);
                }
              }}
              className={cardClasses}
            >
              {content}
            </Link>
          ) : (
            <div
              key={notification.id}
              role="button"
              tabIndex={0}
              aria-label={`Notification: ${notification.title}`}
              className={cardClasses}
              onClick={() => {
                if (!notification.read) {
                  markSingleRead(notification.id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!notification.read) {
                    markSingleRead(notification.id);
                  }
                }
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";

const STATIC_CRUMBS: Record<string, Crumb[]> = {
  "/chat": [{ label: "Dashboard", href: "/dashboard" }, { label: "AI Chat" }],
  "/credentials": [{ label: "Dashboard", href: "/dashboard" }, { label: "Credentials" }],
  "/credentials/account": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Credentials", href: "/credentials" },
    { label: "App Credentials" },
  ],
  "/credentials/bank": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Credentials", href: "/credentials" },
    { label: "Bank Credentials" },
  ],
  "/documents": [{ label: "Dashboard", href: "/dashboard" }, { label: "Documents" }],
  "/documents/library": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Documents", href: "/documents" },
    { label: "Library" },
  ],
  "/email-sync": [{ label: "Dashboard", href: "/dashboard" }, { label: "Email Sync" }],
  "/folders": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Documents", href: "/documents" },
    { label: "Folders" },
  ],
  "/notes": [{ label: "Dashboard", href: "/dashboard" }, { label: "Notes" }],
  "/notifications": [{ label: "Dashboard", href: "/dashboard" }, { label: "Notifications" }],
  "/reminders": [{ label: "Dashboard", href: "/dashboard" }, { label: "Reminders" }],
  "/reminders/calendar-view": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Reminders", href: "/reminders" },
    { label: "Calendar View" },
  ],
  "/search": [{ label: "Dashboard", href: "/dashboard" }, { label: "Search" }],
  "/settings": [{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }],
  "/shared": [{ label: "Dashboard", href: "/dashboard" }, { label: "Shared" }],
  "/wealth": [{ label: "Dashboard", href: "/dashboard" }, { label: "Wealth" }],
  "/wealth/accounts": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Wealth", href: "/wealth" },
    { label: "Accounts" },
  ],
  "/wealth/statements/import": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Wealth", href: "/wealth" },
    { label: "Import statement" },
  ],
  "/wealth/transactions": [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Wealth", href: "/wealth" },
    { label: "Transactions" },
  ],
  "/family": [{ label: "Dashboard", href: "/dashboard" }, { label: "Family" }],
};

const FAMILY_MODULE_LABELS: Record<string, string> = {
  credentials: "Credentials",
  documents: "Documents",
  notes: "Notes",
  reminders: "Reminders",
  wealth: "Wealth",
};

function crumbsForPath(pathname: string): Crumb[] | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const exact = STATIC_CRUMBS[normalized];
  if (exact) return exact;

  const segments = normalized.split("/").filter(Boolean);
  if (segments[0] === "family") {
    const moduleLabel = segments.length === 2 ? FAMILY_MODULE_LABELS[segments[1]] : undefined;
    const ownerModuleLabel = segments.length === 3 ? FAMILY_MODULE_LABELS[segments[2]] : undefined;
    const label = moduleLabel ?? ownerModuleLabel;
    if (label) {
      return [{ label: "Family", href: "/family" }, { label }];
    }
  }
  return undefined;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  className?: string;
  compact?: boolean;
  truncateTitle?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  breadcrumbs,
  className,
  compact = false,
  truncateTitle = false,
}: PageHeaderProps) {
  const pathname = usePathname();
  const crumbs = breadcrumbs ?? crumbsForPath(pathname ?? "");

  return (
    <div className={cn("min-w-0", className)}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} className="mb-1.5" />}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary shadow-fluent-2",
                compact ? "h-8 w-8" : "h-9 w-9",
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1
              className={cn(
                "font-semibold tracking-tight text-text-primary",
                truncateTitle ? "truncate" : "break-words",
                compact ? "text-base leading-6" : "text-lg sm:text-[1.3rem] leading-7",
              )}
            >
              {title}
            </h1>
            {subtitle && <p className="mt-0.5 truncate text-xs text-text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Wallet,
  Lock,
  Users,
  MessageSquare,
  Mail,
  Settings,
  Menu,
  X,
  ShieldCheck,
  BellRing,
  Upload,
  ChevronRight,
  Bell,
  Camera,
  StickyNote,
  FolderOpen,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav({
  onOpenUpload,
  onOpenScan,
  isDriveConnected,
}: {
  onOpenUpload?: () => void;
  onOpenScan?: () => void;
  isDriveConnected?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [moreOpen]);

  const navTabs = [
    { name: "Home", href: "/dashboard", icon: LayoutDashboard },
    { name: "Documents", href: "/documents", icon: FileText },
    { name: "Wealth", href: "/wealth", icon: Wallet },
    { name: "Credentials", href: "/credentials", icon: Lock },
  ];

  const sheetItems = [
    {
      name: "Folders",
      desc: "Nested vault directory",
      href: "/folders",
      icon: FolderOpen,
      accent: "text-brand bg-brand-subtle border-brand/20",
    },
    {
      name: "Shared with me",
      desc: "Read-only shared folders",
      href: "/shared",
      icon: Share2,
      accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      name: "Reminders & Dates",
      desc: "Renewals & credit dues",
      href: "/reminders",
      icon: BellRing,
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      name: "Notes & Lists",
      desc: "Pages, markdown & to-dos",
      href: "/notes",
      icon: StickyNote,
      accent: "text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20",
    },
    {
      name: "Family Sharing",
      desc: "Granular module sharing",
      href: "/family",
      icon: Users,
      accent: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
    },
    {
      name: "AI Assistant",
      desc: "Grounded document chat",
      href: "/chat",
      icon: MessageSquare,
      accent: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      name: "Email Sync",
      desc: "Scan inboxes & forwarding",
      href: "/email-sync",
      icon: Mail,
      accent: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    },
    {
      name: "Notifications",
      desc: "Alerts & recent activity",
      href: "/notifications",
      icon: Bell,
      accent: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      name: "Settings & Security",
      desc: "Drive, App Lock & takeout",
      href: "/settings",
      icon: Settings,
      accent: "text-text-secondary bg-surface-muted border-border",
    },
  ];

  const moreActive = sheetItems.some(
    (item) => pathname === item.href || pathname?.startsWith(`${item.href}/`),
  );

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 backdrop-blur-sm md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <section
            id="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Your Space & tools menu"
            className="animate-fade-up w-full max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-surface-elevated p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-fluent-64"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />

            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-text-primary">
                  Workspace & Tools
                </h2>
                <p className="text-xs text-text-muted">Quick access to every section of Vaulty</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {onOpenUpload && (
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/documents");
                  onOpenUpload();
                }}
                disabled={!isDriveConnected}
                className="mb-2.5 flex w-full items-center justify-between rounded-xl border border-brand/25 bg-brand-subtle p-3.5 text-left text-brand transition-colors hover:bg-brand-subtle/80 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
                    <Upload className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Upload Document</p>
                    <p className="text-xs text-text-muted">
                      {isDriveConnected
                        ? "Save & extract files with AI"
                        : "Connect Google Drive to upload"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-brand" />
              </button>
            )}

            <div className="mb-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  if (onOpenScan) onOpenScan();
                  else if (onOpenUpload) onOpenUpload();
                }}
                disabled={!isDriveConnected}
                className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-muted/60 p-2.5 text-center transition-colors hover:bg-surface-muted disabled:opacity-50"
              >
                <Camera className="mb-1 h-4 w-4 text-brand" />
                <span className="text-[11px] font-medium text-text-primary">+ Scan Doc</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/credentials?tab=APP&action=new");
                }}
                className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-muted/60 p-2.5 text-center transition-colors hover:bg-surface-muted"
              >
                <Lock className="mb-1 h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-[11px] font-medium text-text-primary">+ App Pass</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/credentials?tab=AUTH&action=new");
                }}
                className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-muted/60 p-2.5 text-center transition-colors hover:bg-surface-muted"
              >
                <ShieldCheck className="mb-1 h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-[11px] font-medium text-text-primary">+ 2FA Auth</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/wealth/accounts?action=new");
                }}
                className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-muted/60 p-2.5 text-center transition-colors hover:bg-surface-muted"
              >
                <Wallet className="mb-1 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[11px] font-medium text-text-primary">+ Account</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/notes?action=new");
                }}
                className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-muted/60 p-2.5 text-center transition-colors hover:bg-surface-muted"
              >
                <StickyNote className="mb-1 h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="text-[11px] font-medium text-text-primary">+ Note</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/reminders?action=new");
                }}
                className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-surface-muted/60 p-2.5 text-center transition-colors hover:bg-surface-muted"
              >
                <Bell className="mb-1 h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-[11px] font-medium text-text-primary">+ Reminder</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {sheetItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border p-3 transition-colors",
                      active
                        ? "border-brand/30 bg-brand-subtle/70"
                        : "border-border-subtle bg-surface hover:bg-surface-muted",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                          item.accent,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-text-primary">
                          {item.name}
                        </p>
                        <p className="truncate text-[10px] text-text-muted">{item.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-muted/50 p-3 text-xs text-text-muted">
              <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
              <span>Client-side encrypted vault backed by your Google Drive</span>
            </div>
          </section>
        </div>
      )}

      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-surface/94 backdrop-blur-xl px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-1 md:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.04)]"
      >
        <div className="grid grid-cols-5 items-center">
          {navTabs.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[11px] font-medium transition-colors",
                  active ? "text-brand" : "text-text-muted hover:text-text-secondary",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-11 items-center justify-center rounded-lg transition-colors",
                    active && "bg-brand-subtle text-brand",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="leading-tight">{item.name}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-menu"
            className={cn(
              "flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[11px] font-medium transition-colors",
              moreActive || moreOpen ? "text-brand" : "text-text-muted hover:text-text-secondary",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-11 items-center justify-center rounded-lg transition-colors",
                (moreActive || moreOpen) && "bg-brand-subtle text-brand",
              )}
            >
              <Menu className="h-[18px] w-[18px]" />
            </span>
            <span className="leading-tight">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

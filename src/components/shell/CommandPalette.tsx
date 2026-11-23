"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  Folder,
  Wallet,
  Lock,
  BellRing,
  ArrowRight,
  X,
  LayoutDashboard,
  Loader2,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  type: "document" | "folder" | "wealth" | "credential" | "reminder" | "nav";
  meta?: string;
}

interface SearchResults {
  documents: SearchItem[];
  folders: SearchItem[];
  wealth: SearchItem[];
  credentials: SearchItem[];
  reminders: SearchItem[];
}

const QUICK_NAV: SearchItem[] = [
  {
    id: "nav-dash",
    title: "Dashboard",
    subtitle: "Overview and recent items",
    url: "/dashboard",
    type: "nav",
    meta: "Page",
  },
  {
    id: "nav-docs",
    title: "Documents Library",
    subtitle: "All stored files and folders",
    url: "/documents/library",
    type: "nav",
    meta: "Page",
  },
  {
    id: "nav-wealth",
    title: "Wealth & Balances",
    subtitle: "Accounts, cards, and transactions",
    url: "/wealth",
    type: "nav",
    meta: "Page",
  },
  {
    id: "nav-cred",
    title: "Credentials Vault",
    subtitle: "Encrypted passwords and logins",
    url: "/credentials",
    type: "nav",
    meta: "Page",
  },
  {
    id: "nav-remind",
    title: "Reminders",
    subtitle: "Deadlines, renewals, and payments",
    url: "/reminders",
    type: "nav",
    meta: "Page",
  },
  {
    id: "nav-notes",
    title: "Notes & Lists",
    subtitle: "OneNote-style flat pages, to-dos, and attachments",
    url: "/notes",
    type: "nav",
    meta: "Page",
  },
  {
    id: "nav-chat",
    title: "AI Chat Assistant",
    subtitle: "Ask questions about your documents",
    url: "/chat",
    type: "nav",
    meta: "AI",
  },
  {
    id: "nav-settings",
    title: "Settings & Security",
    subtitle: "Manage connections and security",
    url: "/settings",
    type: "nav",
    meta: "Page",
  },
];

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({
    documents: [],
    folders: [],
    wealth: [],
    credentials: [],
    reminders: [],
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global open/close listeners
  useEffect(() => {
    const openPalette = () => {
      setQuery("");
      setSelectedIndex(0);
      setIsOpen(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openPalette();
        return;
      }

      if (!isInput && e.key === "/" && !isOpen) {
        e.preventDefault();
        openPalette();
        return;
      }

      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    const handleCustomOpen = openPalette;

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("vaulty:open-command-palette", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("vaulty:open-command-palette", handleCustomOpen);
    };
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced live search
  useEffect(() => {
    if (query.trim().length < 2) return;

    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search/omni?q=${encodeURIComponent(query.trim())}&limit=5`);
        if (res.ok && active) {
          const data = await res.json();
          setResults(
            data.results || {
              documents: [],
              folders: [],
              wealth: [],
              credentials: [],
              reminders: [],
            },
          );
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("Omnibox search error:", err);
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  // Flatten active items for keyboard navigation
  const isSearchActive = query.trim().length >= 2;
  const flatItems: SearchItem[] = isSearchActive
    ? [
        ...results.documents,
        ...results.folders,
        ...results.wealth,
        ...results.credentials,
        ...results.reminders,
      ]
    : QUICK_NAV.filter(
        (nav) => !query.trim() || nav.title.toLowerCase().includes(query.toLowerCase()),
      );

  const navigateTo = useCallback(
    (url: string) => {
      setIsOpen(false);
      router.push(url);
    },
    [router],
  );

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (flatItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = flatItems[selectedIndex];
      if (selected) {
        navigateTo(selected.url);
      }
    }
  };

  const getItemIcon = (type: SearchItem["type"], url?: string) => {
    switch (type) {
      case "document":
        return <FileText className="h-4 w-4 text-brand-600" />;
      case "folder":
        return <Folder className="h-4 w-4 text-warning" />;
      case "wealth":
        return <Wallet className="h-4 w-4 text-success" />;
      case "credential":
        return <Lock className="h-4 w-4 text-brand-500" />;
      case "reminder":
        return <BellRing className="h-4 w-4 text-danger" />;
      case "nav":
        if (url?.startsWith("/notes")) return <StickyNote className="h-4 w-4 text-teal-500" />;
        return <LayoutDashboard className="h-4 w-4 text-text-muted" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:p-20">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Universal Search Command Palette"
        className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-surface border border-border shadow-fluent-64 transition-all"
        onKeyDown={handleListKeyDown}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Search className="h-5 w-5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents, wealth, credentials, reminders, or pages..."
            className="flex-1 !border-0 !border-none bg-transparent !px-0 !py-1 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0 !shadow-none"
          />
          {loading && <Loader2 className="h-4 w-4 text-brand animate-spin shrink-0" />}
          {query && !loading && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-surface-muted px-2.5 py-1 text-xs text-text-muted border border-border-subtle">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto px-2 py-1 divide-y divide-border-subtle"
        >
          {flatItems.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              {loading ? "Searching everywhere..." : `No results found for "${query}"`}
            </div>
          ) : (
            <div className="space-y-1">
              {!isSearchActive && (
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Quick Navigation
                </div>
              )}

              {flatItems.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => navigateTo(item.url)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "group flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm cursor-pointer transition-colors",
                      isSelected
                        ? "bg-brand-50 dark:bg-brand-900/30 text-brand"
                        : "hover:bg-surface-muted text-text-primary",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted border border-border-subtle group-hover:border-border">
                        {getItemIcon(item.type, item.url)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{item.title}</div>
                        <div className="text-xs text-text-muted truncate">{item.subtitle}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.meta && (
                        <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-text-muted border border-border-subtle">
                          {item.meta}
                        </span>
                      )}
                      <ArrowRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          isSelected ? "text-brand translate-x-0.5" : "text-transparent",
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-border bg-surface-muted/50 px-4 py-3 text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-lg bg-surface px-2 py-1 border border-border-subtle">↑</kbd>
              <kbd className="rounded-lg bg-surface px-2 py-1 border border-border-subtle">↓</kbd>
              <span className="text-text-secondary">Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-lg bg-surface px-2 py-1 border border-border-subtle">↵</kbd>
              <span className="text-text-secondary">Open</span>
            </span>
          </div>
          <span className="text-text-secondary">Vaulty Universal Search</span>
        </div>
      </div>
    </div>
  );
}

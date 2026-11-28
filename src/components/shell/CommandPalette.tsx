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
  suggestions?: SearchItem[];
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
    subtitle: "Rich text pages, to-dos, and attachments",
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
  const [suggestions, setSuggestions] = useState<SearchItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("vaulty:open-command-palette", openPalette);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("vaulty:open-command-palette", openPalette);
    };
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      setTimeout(() => inputRef.current?.focus(), 20);
    } else if (dialog.open) {
      dialog.close();
      dialog.returnValue = "";
    }
  }, [isOpen]);

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
          setSuggestions(data.suggestions || []);
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

  const isSearchActive = query.trim().length >= 2;
  const resultItems: SearchItem[] = [
    ...results.documents,
    ...results.folders,
    ...results.wealth,
    ...results.credentials,
    ...results.reminders,
  ];
  const showingSuggestions = isSearchActive && resultItems.length === 0 && suggestions.length > 0;
  const flatItems: SearchItem[] = isSearchActive
    ? resultItems.length > 0
      ? resultItems
      : suggestions
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
        return <FileText className="h-4 w-4 text-brand" />;
      case "folder":
        return <Folder className="h-4 w-4 text-warning" />;
      case "wealth":
        return <Wallet className="h-4 w-4 text-success" />;
      case "credential":
        return <Lock className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
      case "reminder":
        return <BellRing className="h-4 w-4 text-danger" />;
      case "nav":
        if (url?.startsWith("/notes")) return <StickyNote className="h-4 w-4 text-teal-500" />;
        return <LayoutDashboard className="h-4 w-4 text-text-muted" />;
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-label="Universal Search Command Palette"
      onCancel={(e) => {
        e.preventDefault();
        setIsOpen(false);
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) setIsOpen(false);
      }}
      className={cn(
        "vaulty-dialog fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none border-0 bg-transparent p-4 sm:p-6 md:pt-20 outline-none",
        isOpen ? "flex items-start justify-center" : "hidden",
      )}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-fluent-64"
        onKeyDown={handleListKeyDown}
      >
        <div className="relative flex items-center gap-3 border-b border-border-subtle px-4 py-3.5">
          <Search className="h-4 w-4 text-text-muted shrink-0" />
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
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-border-subtle bg-surface-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-text-muted">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[58vh] overflow-y-auto px-2 py-2">
          {flatItems.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">
              {loading ? "Searching everywhere..." : `No results found for "${query}"`}
            </div>
          ) : (
            <div className="space-y-0.5">
              {!isSearchActive && (
                <div className="px-3 py-1.5 section-eyebrow">Quick Navigation</div>
              )}
              {showingSuggestions && (
                <div className="px-3 py-1.5 section-eyebrow">No exact matches — recent items</div>
              )}

              {flatItems.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => navigateTo(item.url)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "group flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-brand-subtle text-brand"
                        : "hover:bg-surface-muted text-text-primary",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface">
                        {getItemIcon(item.type, item.url)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate text-[13px]">{item.title}</div>
                        <div className="text-[11px] text-text-muted truncate">{item.subtitle}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.meta && (
                        <span className="rounded border border-border-subtle bg-surface-muted px-2 py-0.5 font-mono text-[10px] text-text-muted">
                          {item.meta}
                        </span>
                      )}
                      <ArrowRight
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          isSelected ? "text-brand translate-x-0.5" : "text-transparent",
                        )}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle bg-surface-muted/50 px-4 py-2.5 text-[11px] text-text-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono">
                ↑
              </kbd>
              <kbd className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono">
                ↓
              </kbd>
              <span className="text-text-secondary">Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono">
                ↵
              </kbd>
              <span className="text-text-secondary">Open</span>
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Vaulty Omnibox
          </span>
        </div>
      </div>
    </dialog>
  );
}

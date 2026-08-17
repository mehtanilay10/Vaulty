"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Search, LogOut, User, Upload, ChevronDown, FileText, Sparkles, Folder, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { VaultLogo } from "@/components/icons/VaultLogo";

export function Navbar({ onOpenUpload, onToggleSidebar }: { onOpenUpload?: () => void; onToggleSidebar?: () => void }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      if (showProfileMenu) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfileMenu]);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.documents || []);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error("Live suggestion fetch error:", err);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSuggestions(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-bg-surface/80 dark:bg-bg-surface/80 backdrop-blur-xl border-b border-border-subtle px-4 lg:px-6 py-3 flex items-center justify-between gap-4 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="md:hidden p-2 rounded-lg hover:bg-bg-muted transition-colors cursor-pointer"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5 text-text-secondary" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <VaultLogo size={32} className="shrink-0" />
          <div className="hidden sm:flex flex-col">
            <span className="font-bold text-lg tracking-tight text-text-primary">
              Vaulty
            </span>
            <span className="text-[10px] uppercase tracking-[0.15em] text-text-muted font-medium">
              Private Vault
            </span>
          </div>
        </Link>
      </div>

      <div ref={searchContainerRef} className="flex-1 max-w-xl relative">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <Search className="w-4 h-4 text-text-muted absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Search documents, tags, folders..."
            className="vault-input w-full pl-10 pr-4 py-2 text-sm placeholder:text-text-muted"
          />
        </form>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden z-50">
            <div className="px-4 py-2 bg-bg-muted border-b border-border-subtle flex items-center justify-between text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              <span>Top Suggestions</span>
              <span>{loadingSuggestions ? "Searching..." : `${suggestions.length} Results`}</span>
            </div>

            <div className="divide-y divide-border-subtle">
              {suggestions.map((item) => (
                <Link
                  key={item.id}
                  href={`/documents/${item.id}`}
                  onClick={() => setShowSuggestions(false)}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-bg-muted transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 rounded-lg bg-accent-primary-soft text-accent-primary shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-xs text-text-primary group-hover:text-accent-primary truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-text-muted truncate flex items-center gap-2">
                        <span>📁 {item.folder?.name}</span>
                        {item.tags?.length > 0 && (
                          <span>&bull; #{item.tags[0].tag.name}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                      item.ownershipType === "Owned by me"
                        ? "bg-accent-primary-soft text-accent-primary"
                        : "bg-accent-emerald-soft text-accent-emerald"
                    }`}
                  >
                    {item.ownershipType}
                  </span>
                </Link>
              ))}
            </div>

            <Link
              href={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
              onClick={() => setShowSuggestions(false)}
              className="block p-2.5 text-center text-xs font-semibold text-accent-primary bg-bg-muted hover:bg-bg-surface transition-colors"
            >
              See all results for &quot;{searchQuery}&quot; →
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        {onOpenUpload && (
          <button
            onClick={onOpenUpload}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl vault-btn-primary text-sm cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload</span>
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-bg-muted transition-colors border border-transparent hover:border-border-subtle cursor-pointer"
          >
            {session?.user?.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || "User Avatar"}
                className="w-8 h-8 rounded-lg object-cover ring-2 ring-accent-primary/30"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-accent-primary-soft text-accent-primary flex items-center justify-center font-bold text-xs ring-1 ring-accent-primary/30">
                {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
              </div>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-text-muted hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-bg-surface border border-border-subtle rounded-2xl shadow-2xl py-2 z-50">
              <div className="px-4 py-2.5 border-b border-border-subtle">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {session?.user?.name || "User Account"}
                </p>
                <p className="text-xs text-text-muted truncate mt-0.5">
                  {session?.user?.email}
                </p>
              </div>

              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-text-secondary hover:bg-bg-muted transition-colors"
                >
                  <User className="w-4 h-4 text-text-muted" />
                  <span>Account Settings</span>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-accent-rose hover:bg-accent-rose-soft transition-colors text-left cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

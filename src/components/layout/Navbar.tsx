"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Search, Shield, LogOut, User, Upload, ChevronDown, FileText, Sparkles, Folder } from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar({ onOpenUpload }: { onOpenUpload?: () => void }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch top 5 live suggestions as user types
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
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/80 px-4 lg:px-8 py-3 flex items-center justify-between gap-4 transition-colors">
      {/* Brand logo */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <VaultIcon className="w-5 h-5" />
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-600 dark:from-white dark:to-indigo-200 bg-clip-text text-transparent">
              Vaulty
            </span>
            <span className="text-[9px] uppercase tracking-widest text-indigo-500 dark:text-indigo-400 font-medium">
              Private Vault
            </span>
          </div>
        </Link>
      </div>

      {/* Global Search Bar with Live Top 5 Suggestions Dropdown */}
      <div ref={searchContainerRef} className="flex-1 max-w-xl relative">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Search documents, tags, folders, AI summaries..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-slate-200 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
          />
        </form>

        {/* Live Top 5 Suggestions Panel */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <span>Top 5 Priority Suggestions</span>
              <span>{loadingSuggestions ? "Searching..." : `${suggestions.length} Results`}</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {suggestions.map((item) => (
                <Link
                  key={item.id}
                  href={`/documents/${item.id}`}
                  onClick={() => setShowSuggestions(false)}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-xs text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate flex items-center gap-2">
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
                        ? "bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                        : "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
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
              className="block p-2.5 text-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-950/80 transition-colors"
            >
              See all results for &quot;{searchQuery}&quot; &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2.5">
        <ThemeToggle />

        {onOpenUpload && (
          <button
            onClick={onOpenUpload}
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-medium shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
          </button>
        )}

        {/* Profile Avatar / Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60 cursor-pointer"
          >
            {session?.user?.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || "User Avatar"}
                className="w-8 h-8 rounded-lg object-cover ring-2 ring-indigo-500/30"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center font-bold text-xs ring-1 ring-indigo-500/30">
                {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
              </div>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {session?.user?.name || "User Account"}
                </p>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {session?.user?.email}
                </p>
              </div>

              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  <span>Account Settings</span>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
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

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9v3l2 1" />
    </svg>
  );
}

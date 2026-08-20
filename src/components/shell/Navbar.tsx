"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { LogOut, User, Upload, ChevronDown, Search, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { VaultLogo } from "@/components/icons/VaultLogo";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";

export function Navbar({ onOpenUpload, isDriveConnected }: { onOpenUpload?: () => void; isDriveConnected?: boolean }) {
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
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <header className="fixed top-0 left-0 right-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-border-subtle px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <VaultLogo size={32} className="shrink-0" />
          <div className="hidden sm:flex flex-col">
            <span className="font-semibold text-lg tracking-tight text-text-primary">
              Vaulty
            </span>
            <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium">
              Private Vault
            </span>
          </div>
        </Link>
      </div>

      <div ref={searchContainerRef} className="flex-1 max-w-xl relative">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center">
          <Search className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Search documents, tags, folders..."
            className="input w-full pl-9 pr-4 py-1.5 text-sm"
          />
        </form>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-surface border border-border-subtle rounded-lg shadow-lg overflow-hidden z-50">
            <div className="px-4 py-2 bg-surface-muted border-b border-border-subtle flex items-center justify-between text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              <span>Top Suggestions</span>
              <span>{loadingSuggestions ? "Searching..." : `${suggestions.length} Results`}</span>
            </div>

            <div className="divide-y divide-border-subtle">
              {suggestions.map((item) => (
                <Link
                  key={item.id}
                  href={`/documents/${item.id}`}
                  onClick={() => setShowSuggestions(false)}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-surface-muted transition-colors"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 rounded-md bg-brand-subtle text-brand shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-xs text-text-primary truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-text-muted truncate">
                        {item.folder?.name}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <Link
              href={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
              onClick={() => setShowSuggestions(false)}
              className="block p-2.5 text-center text-xs font-semibold text-brand hover:bg-surface-muted transition-colors"
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
            disabled={!isDriveConnected}
            className="btn btn-primary hidden sm:flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
          >
            <Upload className="w-4 h-4" />
            <span>Upload</span>
          </button>
        )}

        <Dropdown
          trigger={
            <button className="flex items-center gap-2 p-1 rounded-md hover:bg-surface-muted transition-colors cursor-pointer">
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User Avatar"}
                  className="w-8 h-8 rounded-md object-cover ring-2 ring-brand/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-md bg-brand-subtle text-brand flex items-center justify-center font-bold text-xs ring-1 ring-brand/20">
                  {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
                </div>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-text-muted hidden sm:block" />
            </button>
          }
          align="right"
        >
          <div className="px-3 py-2 border-b border-border-subtle">
            <p className="text-sm font-semibold text-text-primary truncate">
              {session?.user?.name || "User Account"}
            </p>
            <p className="text-xs text-text-muted truncate">{session?.user?.email}</p>
          </div>
          <div className="py-1">
            <DropdownItem onClick={() => { router.push("/settings"); }}>
              <User className="w-4 h-4 inline mr-2" />
              Account Settings
            </DropdownItem>
            <DropdownItem destructive onClick={() => signOut({ callbackUrl: "/" })}>
              <LogOut className="w-4 h-4 inline mr-2" />
              Sign Out
            </DropdownItem>
          </div>
        </Dropdown>
      </div>
    </header>
  );
}

"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { Search, Shield, LogOut, User, FolderPlus, Upload, Menu, X, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

export function Navbar({ onOpenUpload }: { onOpenUpload?: () => void }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
      {/* Brand logo */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <VaultIcon className="w-5 h-5" />
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">
              Vaulty
            </span>
            <span className="text-[9px] uppercase tracking-widest text-indigo-400 font-medium">
              Private Vault
            </span>
          </div>
        </Link>
      </div>

      {/* Global Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents, tags, folders, AI summaries..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-slate-200 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
          />
        </div>
      </form>

      {/* Right actions */}
      <div className="flex items-center gap-3">
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
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-700/60 cursor-pointer"
          >
            {session?.user?.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || "User Avatar"}
                className="w-8 h-8 rounded-lg object-cover ring-2 ring-indigo-500/30"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs ring-1 ring-indigo-500/30">
                {session?.user?.name?.[0] || session?.user?.email?.[0] || "U"}
              </div>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-4 py-2.5 border-b border-slate-800">
                <p className="text-sm font-semibold text-white truncate">
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
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  <span>Account Settings</span>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
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

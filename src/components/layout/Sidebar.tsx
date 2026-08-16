"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Users, Folder, Search, Settings, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "My Documents", href: "/documents", icon: FileText },
  { name: "Shared With Me", href: "/shared", icon: Users },
  { name: "Folders", href: "/folders", icon: Folder },
  { name: "Search", href: "/search", icon: Search },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-100/70 dark:bg-slate-900/60 border-r border-slate-200 dark:border-slate-800/80 p-4 flex flex-col justify-between hidden md:flex shrink-0 transition-colors">
      <div className="space-y-6">
        <div className="px-3 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
            Vault System
          </p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group",
                  isActive
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20 shadow-sm font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/50"
                )}
              >
                <Icon
                  className={clsx(
                    "w-4 h-4 transition-colors",
                    isActive ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                  )}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Security Info Card */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 space-y-1.5 shadow-sm">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span>Strict Server Auth</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-500 font-light">
          All document access verifies permissions directly against PostgreSQL database before serving file buffers.
        </p>
      </div>
    </aside>
  );
}

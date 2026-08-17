"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Users, Folder, Search, Settings, ShieldCheck, RefreshCw, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { VaultLogo } from "@/components/icons/VaultLogo";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Shared", href: "/shared", icon: Users },
  { name: "Folders", href: "/folders", icon: Folder },
  { name: "Sync", href: "/sync", icon: RefreshCw },
  { name: "Search", href: "/search", icon: Search },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-bg-surface border-r border-border-subtle p-4 flex flex-col justify-between hidden md:flex shrink-0 transition-colors">
      <div className="space-y-6">
        <div className="px-3 pt-2 flex items-center gap-3">
          <VaultLogo size={28} />
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-text-primary">
              Vaulty
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-text-muted font-medium">
              Private Vault
            </span>
          </div>
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
                    ? "bg-accent-primary-soft text-accent-primary font-semibold"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-muted"
                )}
              >
                <Icon
                  className={clsx(
                    "w-4 h-4 transition-colors",
                    isActive ? "text-accent-primary" : "text-text-muted group-hover:text-text-secondary"
                  )}
                />
                <span>{item.name}</span>
                {isActive && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto text-accent-primary" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3.5 rounded-2xl bg-bg-muted border border-border-subtle text-xs text-text-muted space-y-1.5">
        <div className="flex items-center gap-2 text-accent-secondary font-semibold">
          <ShieldCheck className="w-4 h-4" />
          <span>Strict Server Auth</span>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted font-light">
          All document access verifies permissions directly against PostgreSQL database before serving file buffers.
        </p>
      </div>
    </aside>
  );
}

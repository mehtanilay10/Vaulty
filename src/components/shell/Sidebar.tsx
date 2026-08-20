"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Folder,
  ShieldCheck,
} from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Folders", href: "/folders", icon: Folder },
  { name: "Shared", href: "/shared", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-surface border-r border-border-subtle flex flex-col hidden md:flex shrink-0 fixed h-[calc(100vh-3.5rem)]">
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-subtle text-brand font-semibold"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-muted"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive ? "text-brand" : "text-text-muted")} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4">
        <div className="p-3 rounded-lg bg-surface-muted border border-border-subtle text-xs text-text-muted space-y-1">
          <div className="flex items-center gap-2 text-brand font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Strict Server Auth</span>
          </div>
          <p className="text-[11px] leading-relaxed font-light">
            All document access verifies permissions directly against PostgreSQL database before serving file buffers.
          </p>
        </div>
      </div>
    </aside>
  );
}

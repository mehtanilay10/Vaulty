"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Users, Search, Plus } from "lucide-react";
import { clsx } from "clsx";

export function MobileNav({ onOpenUpload }: { onOpenUpload?: () => void }) {
  const pathname = usePathname();

  const navItems = [
    { name: "Home", href: "/dashboard", icon: LayoutDashboard },
    { name: "Documents", href: "/documents", icon: FileText },
    { name: "Shared", href: "/shared", icon: Users },
    { name: "Search", href: "/search", icon: Search },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/80 px-4 py-2 flex items-center justify-around md:hidden">
      {navItems.slice(0, 2).map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            className={clsx(
              "flex flex-col items-center gap-1 p-2 rounded-xl text-[11px] font-medium transition-colors",
              isActive ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{item.name}</span>
          </Link>
        );
      })}

      {/* Quick Upload Button */}
      {onOpenUpload && (
        <button
          onClick={onOpenUpload}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-600/40 -mt-6 ring-4 ring-slate-950 active:scale-90 transition-transform cursor-pointer"
          aria-label="Upload document"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {navItems.slice(2).map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            className={clsx(
              "flex flex-col items-center gap-1 p-2 rounded-xl text-[11px] font-medium transition-colors",
              isActive ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

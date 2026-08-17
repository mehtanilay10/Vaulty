"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Folder, Users, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav({ onOpenUpload }: { onOpenUpload?: () => void }) {
  const pathname = usePathname();

  const navItems = [
    { name: "Home", href: "/dashboard", icon: LayoutDashboard },
    { name: "Folders", href: "/folders", icon: Folder },
    { name: "Shared", href: "/shared", icon: Users },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-border-subtle px-2 py-2 flex items-center justify-around md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-md text-[11px] font-medium transition-colors min-w-[3.5rem]",
              isActive ? "text-brand font-semibold" : "text-text-muted hover:text-text-secondary"
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{item.name}</span>
          </Link>
        );
      })}

      {onOpenUpload && (
        <button
          onClick={onOpenUpload}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-brand text-white shadow-lg shadow-brand/30 -mt-8 ring-4 ring-background active:scale-90 transition-transform cursor-pointer"
          aria-label="Upload document"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
      )}
    </div>
  );
}

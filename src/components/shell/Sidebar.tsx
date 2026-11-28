"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Users,
  Wallet,
  Mail,
  BellRing,
  Lock,
  StickyNote,
} from "lucide-react";

interface SidebarItem {
  name: string;
  href: string;
  icon: React.ElementType;
  dotColor?: string;
  activeText?: string;
}

const primaryGroups: { label: string; items: SidebarItem[] }[] = [
  {
    label: "Your Space",
    items: [
      {
        name: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        dotColor: "bg-brand",
        activeText: "text-brand",
      },
      {
        name: "Documents",
        href: "/documents",
        icon: FileText,
        dotColor: "bg-blue-600 dark:bg-blue-400",
        activeText: "text-blue-600 dark:text-blue-400",
      },
      {
        name: "Wealth",
        href: "/wealth",
        icon: Wallet,
        dotColor: "bg-emerald-600 dark:bg-emerald-400",
        activeText: "text-emerald-600 dark:text-emerald-400",
      },
      {
        name: "Credentials",
        href: "/credentials",
        icon: Lock,
        dotColor: "bg-purple-600 dark:bg-purple-400",
        activeText: "text-purple-600 dark:text-purple-400",
      },
      {
        name: "Reminders",
        href: "/reminders",
        icon: BellRing,
        dotColor: "bg-amber-600 dark:bg-amber-400",
        activeText: "text-amber-600 dark:text-amber-400",
      },
      {
        name: "Notes",
        href: "/notes",
        icon: StickyNote,
        dotColor: "bg-teal-600 dark:bg-teal-400",
        activeText: "text-teal-600 dark:text-teal-400",
      },
    ],
  },
  {
    label: "AI & Sharing",
    items: [
      {
        name: "AI Chat",
        href: "/chat",
        icon: MessageSquare,
        dotColor: "bg-cyan-600 dark:bg-cyan-400",
        activeText: "text-cyan-600 dark:text-cyan-400",
      },
      {
        name: "Email Sync",
        href: "/email-sync",
        icon: Mail,
        dotColor: "bg-indigo-600 dark:bg-indigo-400",
        activeText: "text-indigo-600 dark:text-indigo-400",
      },
      {
        name: "Family",
        href: "/family",
        icon: Users,
        dotColor: "bg-rose-600 dark:bg-rose-400",
        activeText: "text-rose-600 dark:text-rose-400",
      },
    ],
  },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  const isItemActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
  };

  return (
    <aside
      className={cn(
        "mica-panel fixed left-0 top-14 z-30 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-border-subtle transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.5rem]" : "w-60",
      )}
      aria-label="Main navigation"
    >
      <nav className={cn("flex-1 space-y-5 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {primaryGroups.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p className="section-eyebrow px-2.5 pb-1.5">{group.label}</p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-border-subtle" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.name : undefined}
                    className={cn(
                      "group relative flex items-center rounded-lg py-2 text-[13px] transition-colors",
                      collapsed ? "justify-center px-2" : "gap-2.5 px-2.5",
                      active
                        ? "bg-surface font-semibold text-text-primary shadow-fluent-2 border border-border-subtle"
                        : "font-medium text-text-secondary hover:bg-surface-muted/75 hover:text-text-primary border border-transparent",
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full",
                          item.dotColor || "bg-brand",
                        )}
                      />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active
                          ? item.activeText || "text-brand"
                          : "text-text-muted group-hover:text-text-primary",
                      )}
                    />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

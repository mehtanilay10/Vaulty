"use client";

import { useState } from "react";
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
  ChevronDown,
} from "lucide-react";

interface SubItem {
  name: string;
  href: string;
  icon?: React.ElementType;
}

interface SidebarItem {
  name: string;
  href: string;
  icon: React.ElementType;
  activeColor?: string;
  activeBg?: string;
  children?: SubItem[];
}

const groups: { label: string; items: SidebarItem[] }[] = [
  {
    label: "Your Space",
    items: [
      {
        name: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        name: "Documents",
        href: "/documents",
        icon: FileText,
        activeColor: "text-blue-600 dark:text-blue-400",
        activeBg: "bg-blue-500/10",
      },
      {
        name: "Wealth",
        href: "/wealth",
        icon: Wallet,
        activeColor: "text-emerald-600 dark:text-emerald-400",
        activeBg: "bg-emerald-500/10",
      },
      {
        name: "Credentials",
        href: "/credentials",
        icon: Lock,
        activeColor: "text-purple-600 dark:text-purple-400",
        activeBg: "bg-purple-500/10",
      },
      {
        name: "Reminders",
        href: "/reminders",
        icon: BellRing,
        activeColor: "text-amber-600 dark:text-amber-400",
        activeBg: "bg-amber-500/10",
      },
      {
        name: "Notes",
        href: "/notes",
        icon: StickyNote,
        activeColor: "text-teal-600 dark:text-teal-400",
        activeBg: "bg-teal-500/10",
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
        activeColor: "text-sky-600 dark:text-sky-400",
        activeBg: "bg-sky-500/10",
      },
      {
        name: "Email Sync",
        href: "/email-sync",
        icon: Mail,
        activeColor: "text-indigo-600 dark:text-indigo-400",
        activeBg: "bg-indigo-500/10",
      },
      {
        name: "Family",
        href: "/family",
        icon: Users,
        activeColor: "text-rose-600 dark:text-rose-400",
        activeBg: "bg-rose-500/10",
      },
    ],
  },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  // User manual toggle overrides
  const [manualToggles, setManualToggles] = useState<Record<string, boolean>>({});

  const toggleItem = (name: string, currentlyExpanded: boolean) => {
    setManualToggles((prev) => ({
      ...prev,
      [name]: !currentlyExpanded,
    }));
  };

  return (
    <aside
      className={cn(
        "mica-panel fixed left-0 top-14 z-30 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-border-subtle bg-surface/80 backdrop-blur-md transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.75rem]" : "w-64",
      )}
      aria-label="Main navigation"
    >
      <nav className={cn("flex-1 space-y-5 overflow-y-auto py-4", collapsed ? "px-2" : "px-3.5")}>
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && <p className="section-eyebrow px-2.5 pb-1.5">{group.label}</p>}
            {collapsed && <div className="mx-auto mb-2 h-px w-7 bg-border-subtle" />}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const hasChildren = Boolean(item.children && item.children.length > 0);

                // Check active state
                const isParentActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname?.startsWith(item.href));

                const anyChildActive =
                  hasChildren &&
                  Boolean(
                    item.children?.some((child) => {
                      const cleanHref = child.href.split("?")[0];
                      if (child.href === "/reminders/calander-view") {
                        return (
                          pathname === "/reminders/calander-view" ||
                          pathname === "/reminders/calendar-view"
                        );
                      }
                      return pathname === cleanHref;
                    }),
                  );

                const isActive = isParentActive || anyChildActive;
                const isExpanded =
                  manualToggles[item.name] !== undefined
                    ? manualToggles[item.name]
                    : anyChildActive;

                return (
                  <div key={item.name} className="space-y-0.5">
                    <div
                      className={cn(
                        "group relative flex items-center rounded-xl text-[13px] transition-all",
                        collapsed ? "justify-center" : "justify-between",
                        isActive && !hasChildren
                          ? "bg-surface-elevated font-semibold text-text-primary shadow-sm border border-border-subtle"
                          : isActive && hasChildren
                            ? "bg-surface-muted/70 font-semibold text-text-primary"
                            : "font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary",
                      )}
                    >
                      <Link
                        href={item.href}
                        aria-current={isActive && !hasChildren ? "page" : undefined}
                        title={collapsed ? item.name : undefined}
                        className={cn(
                          "flex flex-1 items-center py-2 transition-all",
                          collapsed ? "justify-center px-1.5" : "gap-3 px-3",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                            isActive
                              ? item.activeColor && item.activeBg
                                ? `${item.activeBg} ${item.activeColor}`
                                : "bg-brand-subtle text-brand"
                              : "text-text-muted group-hover:text-text-primary",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        {!collapsed && <span className="truncate">{item.name}</span>}
                      </Link>

                      {/* Expand / Collapse Chevron */}
                      {hasChildren && !collapsed && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleItem(item.name, isExpanded);
                          }}
                          aria-label={isExpanded ? `Collapse ${item.name}` : `Expand ${item.name}`}
                          className="mr-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
                        >
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform duration-200",
                              isExpanded ? "rotate-0" : "-rotate-90",
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {/* Submenu Children Accordion */}
                    {hasChildren && !collapsed && isExpanded && (
                      <div className="relative ml-5 pl-3 border-l border-border-subtle space-y-0.5 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        {item.children?.map((child) => {
                          const SubIcon = child.icon;
                          const cleanChildHref = child.href.split("?")[0];

                          let isChildCurrent = pathname === cleanChildHref;
                          if (child.href === "/reminders/calander-view") {
                            isChildCurrent =
                              pathname === "/reminders/calander-view" ||
                              pathname === "/reminders/calendar-view";
                          } else if (child.href === item.href) {
                            // "Overview" child is active only when exactly on the overview page
                            isChildCurrent = pathname === item.href;
                          }

                          return (
                            <Link
                              key={child.name}
                              href={child.href}
                              aria-current={isChildCurrent ? "page" : undefined}
                              className={cn(
                                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                                isChildCurrent
                                  ? "bg-brand/10 font-semibold text-brand"
                                  : "text-text-muted hover:bg-surface-muted hover:text-text-primary",
                              )}
                            >
                              {SubIcon ? (
                                <SubIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              ) : (
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    isChildCurrent ? "bg-brand" : "bg-text-muted/40",
                                  )}
                                />
                              )}
                              <span className="truncate">{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

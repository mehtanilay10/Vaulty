"use client";

import { cn } from "@/lib/utils";
import { startViewTransition } from "@/lib/view-transition";

export function Tabs({
  children,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full border-b border-border-subtle", className)}>
      <div
        role="tablist"
        className="flex items-center gap-1 overflow-x-auto overflow-y-hidden px-2 scrollbar-hide"
      >
        {children}
      </div>
    </div>
  );
}

export function Tab({
  value,
  active,
  onClick,
  icon,
  children,
}: {
  value: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-value={value}
      onClick={() => {
        if (!active) {
          startViewTransition(onClick);
        }
      }}
      className={cn(
        "relative flex items-center gap-2 whitespace-nowrap rounded-t px-3 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none",
        active
          ? "text-brand after:absolute after:inset-x-1.5 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-brand shadow-[0_1px_0_0_transparent]"
          : "text-text-muted hover:bg-surface-muted hover:text-text-primary",
      )}
    >
      {icon && <span className={cn(active ? "text-brand" : "text-text-muted")}>{icon}</span>}
      {children}
    </button>
  );
}

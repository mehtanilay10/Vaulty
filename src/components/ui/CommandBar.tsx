"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface CommandBarItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  active?: boolean;
  href?: string;
  title?: string;
  className?: string;
}

interface CommandBarProps {
  className?: string;
  children?: React.ReactNode;
  items?: CommandBarItem[];
  farItems?: React.ReactNode | CommandBarItem[];
  compact?: boolean;
}

const itemBase =
  "inline-flex h-8 items-center gap-1.5 rounded-none px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:pointer-events-none disabled:opacity-50";

function itemTone(opts: { primary: boolean; danger: boolean; active: boolean }) {
  if (opts.primary) {
    return "bg-brand text-white hover:bg-brand-hover active:bg-brand-hover/90 shadow-xs";
  }
  if (opts.danger) {
    return "text-danger hover:bg-danger/10 hover:text-danger active:bg-danger/15";
  }
  if (opts.active) {
    return "bg-surface-muted text-brand font-semibold hover:bg-surface-muted/90";
  }
  return "text-text-secondary hover:bg-surface-muted hover:text-text-primary active:bg-surface-muted/90";
}

export function CommandBar({
  className,
  children,
  items,
  farItems,
  compact = false,
}: CommandBarProps) {
  return (
    <div
      className={cn(
        "fluent-command-bar flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 transition-colors",
        compact ? "min-h-[38px] py-1" : "min-h-[44px]",
        className,
      )}
      role="toolbar"
      aria-orientation="horizontal"
    >
      {/* Primary / Left Command Items */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none py-0.5">
        {items?.map((item) => (
          <CommandBarButton key={item.key} item={item} />
        ))}
        {children}
      </div>

      {/* Far / Right Items (Views, Filter, Search, Sort) */}
      {farItems && (
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border-subtle pl-2">
          {Array.isArray(farItems)
            ? farItems.map((item) => (
                <CommandBarButton
                  key={(item as CommandBarItem).key}
                  item={item as CommandBarItem}
                />
              ))
            : farItems}
        </div>
      )}
    </div>
  );
}

export function CommandBarButton({
  item,
  children,
  icon,
  primary = false,
  danger = false,
  active = false,
  disabled = false,
  onClick,
  title,
  className,
}: {
  item?: CommandBarItem;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  primary?: boolean;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const isPrimary = item?.primary ?? primary;
  const isDanger = item?.danger ?? danger;
  const isActive = item?.active ?? active;
  const isDisabled = item?.disabled ?? disabled;
  const clickHandler = item?.onClick ?? onClick;
  const label = item?.label ?? children;
  const buttonIcon = item?.icon ?? icon;
  const tooltip = item?.title ?? title;
  const tone = itemTone({ primary: isPrimary, danger: isDanger, active: isActive });

  if (item?.href) {
    return (
      <a
        href={item.href}
        title={tooltip}
        className={cn(
          itemBase,
          tone,
          isDisabled && "pointer-events-none opacity-50",
          item?.className,
          className,
        )}
      >
        {buttonIcon && <span className="shrink-0">{buttonIcon}</span>}
        {label && <span>{label}</span>}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={clickHandler}
      disabled={isDisabled}
      title={tooltip}
      className={cn(itemBase, tone, item?.className, className)}
    >
      {buttonIcon && <span className="shrink-0">{buttonIcon}</span>}
      {label && <span>{label}</span>}
    </button>
  );
}

export function CommandBarDivider({ className }: { className?: string }) {
  return (
    <div className={cn("mx-1 h-4 w-px shrink-0 bg-border-subtle", className)} aria-hidden="true" />
  );
}

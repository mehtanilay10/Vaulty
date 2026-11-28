"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}

export function Dropdown({ trigger, children, align = "right" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleChildClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[role='button']") || target.closest("a")) {
      setTimeout(close, 0);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </div>
      {open && (
        <div
          role="menu"
          onClick={handleChildClick}
          className={cn(
            "animate-fade-up absolute top-full z-50 mt-2 min-w-[13.5rem] overflow-hidden rounded-xl border border-border bg-surface-elevated p-1.5 shadow-fluent-16",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  href,
  destructive,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  destructive?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors cursor-pointer",
    destructive
      ? "text-danger hover:bg-danger-subtle"
      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
  );

  if (href) {
    return (
      <Link href={href} role="menuitem" onClick={onClick} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClick?.();
      }}
      className={className}
    >
      {children}
    </button>
  );
}

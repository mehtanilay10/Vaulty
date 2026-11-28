"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

const sizeClasses = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  "2xl": "sm:max-w-6xl",
  full: "sm:max-w-[95vw] lg:max-w-[90vw] xl:max-w-[85vw]",
} as const;

interface BladeProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  subheader?: React.ReactNode;
  headerActions?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof sizeClasses;
}

export function Blade({
  open,
  onClose,
  title,
  description,
  icon,
  subheader,
  headerActions,
  bodyClassName,
  children,
  footer,
  size = "md",
}: BladeProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;

    const getFocusableElements = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((element) => element.offsetParent !== null);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      if (panelRef.current?.contains(document.activeElement)) return;

      const initialField = panelRef.current?.querySelector<HTMLElement>(
        "[autofocus], input:not([type='hidden']), select, textarea",
      );
      (initialField || panelRef.current)?.focus();
    }, 20);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
      previousActiveElement?.focus();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div
        className="blade-overlay absolute inset-0"
        onClick={onClose}
        onWheel={(event) => event.preventDefault()}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "blade-panel relative flex h-screen h-[100dvh] max-h-screen w-full flex-col overflow-hidden overscroll-contain border-l border-border bg-surface-elevated shadow-fluent-64 outline-none sm:rounded-none",
          sizeClasses[size],
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="mt-0.5 hidden h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-surface-muted text-brand sm:flex">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2
                id={titleId}
                className="truncate text-[15px] font-semibold text-text-primary sm:text-base"
              >
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-xs text-text-muted sm:text-[13px]">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {subheader && <div className="shrink-0 border-b border-border-subtle">{subheader}</div>}

        <div
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/40 px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

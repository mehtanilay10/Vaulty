"use client";

import { useEffect, useRef, useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  fullScreenMobile?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "md",
  fullScreenMobile = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [open]);

  if (!mounted) return null;

  const maxWidthClasses = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-xl",
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Light dismiss: clicked on dialog backdrop
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      className={cn(
        "fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none border-0 bg-transparent p-0 text-text-primary outline-none backdrop:bg-black/45 backdrop:backdrop-blur-sm",
        "flex items-center justify-center sm:p-4",
        !open && "hidden",
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "modal-content w-full bg-surface-elevated border border-border-subtle shadow-fluent-64",
          fullScreenMobile
            ? "max-sm:fixed max-sm:inset-0 max-sm:h-[100dvh] max-sm:w-full max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:flex max-sm:flex-col max-sm:overflow-hidden"
            : "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:max-h-[90svh] max-sm:overflow-y-auto",
          "sm:relative sm:rounded-2xl sm:max-h-[85vh] sm:mx-auto",
          maxWidthClasses[maxWidth],
        )}
      >
        {/* Mobile handle indicator */}
        {!fullScreenMobile && (
          <div className="flex justify-center pt-2.5 pb-0 sm:hidden">
            <div className="h-1.5 w-10 rounded-full bg-border" />
          </div>
        )}

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold text-text-primary tracking-tight">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={cn(
            "px-5 py-5 sm:px-6",
            fullScreenMobile && "max-sm:flex-1 max-sm:min-h-0 max-sm:overflow-y-auto",
          )}
        >
          {children}
        </div>

        {footer && (
          <div
            className={cn(
              "flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/30 px-5 py-3.5 sm:px-6",
              fullScreenMobile && "max-sm:shrink-0",
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
}

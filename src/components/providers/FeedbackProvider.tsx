"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";
type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
};
type FeedbackContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
};
type ToastItem = { id: number; message: string; tone: ToastTone };

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const toastId = useRef(0);
  const timeoutIds = useRef<Set<number>>(new Set());
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const confirmTitleId = useId();
  const confirmDescId = useId();

  useEffect(() => {
    const activeTimeouts = timeoutIds.current;
    return () => {
      activeTimeouts.forEach((id) => window.clearTimeout(id));
      activeTimeouts.clear();
    };
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, message, tone }].slice(-4));
    const timerId = window.setTimeout(() => {
      timeoutIds.current.delete(timerId);
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
    timeoutIds.current.add(timerId);
  }, []);

  const confirmAction = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        if (resolver.current) resolver.current(false);
        resolver.current = resolve;
        setConfirmation(options);
      }),
    [],
  );

  const finishConfirmation = useCallback((confirmed: boolean) => {
    const dialog = confirmDialogRef.current;
    if (dialog?.open) {
      dialog.close();
      dialog.returnValue = "";
    }
    resolver.current?.(confirmed);
    resolver.current = null;
    setConfirmation(null);
  }, []);

  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    if (confirmation) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [confirmation]);

  return (
    <FeedbackContext.Provider value={{ toast, confirmAction }}>
      {children}
      <div
        className="fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className="animate-fade-up flex items-start gap-2.5 rounded-lg border border-border bg-surface-elevated p-3.5 shadow-fluent-16"
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                item.tone === "success"
                  ? "bg-success-subtle text-success"
                  : item.tone === "error"
                    ? "bg-danger-subtle text-danger"
                    : "bg-info-subtle text-info"
              }`}
            >
              {item.tone === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : item.tone === "error" ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <Info className="h-3.5 w-3.5" />
              )}
            </span>
            <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-text-primary">
              {item.message}
            </p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() =>
                setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id))
              }
              className="rounded p-0.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <dialog
        ref={confirmDialogRef}
        closedby="any"
        aria-labelledby={confirmTitleId}
        aria-describedby={confirmDescId}
        onCancel={(event) => {
          event.preventDefault();
          finishConfirmation(false);
        }}
        onClick={(event) => {
          if (event.target === confirmDialogRef.current) {
            finishConfirmation(false);
          }
        }}
        className={
          confirmation
            ? "vaulty-dialog fixed inset-0 z-[110] m-0 flex h-full w-full max-h-none max-w-none items-center justify-center border-0 bg-transparent p-4 outline-none"
            : "hidden"
        }
      >
        {confirmation && (
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-elevated p-5 shadow-fluent-64">
            <h1 id={confirmTitleId} className="text-[15px] font-semibold text-text-primary">
              {confirmation.title}
            </h1>
            <p id={confirmDescId} className="mt-2 text-[13px] leading-relaxed text-text-secondary">
              {confirmation.description}
            </p>
            <div className="mt-5 flex justify-end gap-2 border-t border-border-subtle pt-4">
              <button
                type="button"
                autoFocus
                onClick={() => finishConfirmation(false)}
                className="btn btn-secondary h-9 px-3.5 text-[13px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => finishConfirmation(true)}
                className={`btn h-9 px-3.5 text-[13px] ${
                  confirmation.tone === "danger" ? "btn-danger" : "btn-primary"
                }`}
              >
                {confirmation.confirmLabel || "Continue"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback must be used within FeedbackProvider");
  return context;
}

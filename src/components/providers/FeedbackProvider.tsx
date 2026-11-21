"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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

  const finishConfirmation = (confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setConfirmation(null);
  };

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
            className="flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-elevated p-3 shadow-fluent-8"
          >
            {item.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : item.tone === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            )}
            <p className="min-w-0 flex-1 text-sm text-text-primary">{item.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() =>
                setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id))
              }
              className="text-text-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {confirmation && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) finishConfirmation(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") finishConfirmation(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vaulty-confirm-title"
            aria-describedby="vaulty-confirm-description"
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-fluent-64"
          >
            <h2 id="vaulty-confirm-title" className="text-base font-semibold text-text-primary">
              {confirmation.title}
            </h2>
            <p
              id="vaulty-confirm-description"
              className="mt-2 text-sm leading-relaxed text-text-secondary"
            >
              {confirmation.description}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => finishConfirmation(false)}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => finishConfirmation(true)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold text-white ${confirmation.tone === "danger" ? "bg-danger hover:opacity-90" : "bg-brand hover:opacity-90"}`}
              >
                {confirmation.confirmLabel || "Continue"}
              </button>
            </div>
          </section>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback must be used within FeedbackProvider");
  return context;
}

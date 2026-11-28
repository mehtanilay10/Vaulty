"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Database, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isDatabaseUnavailableError } from "@/lib/db-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dbDown = isDatabaseUnavailableError(error);

  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-surface text-text-primary">
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-fluent-16">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
              {dbDown ? <Database className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {dbDown ? "Database is waking up" : "Something went wrong"}
            </h1>
            <p className="mt-2 text-sm text-text-muted leading-relaxed">
              {dbDown
                ? "We couldn't reach the database right now. It may be resuming from sleep — please wait a few seconds and try again."
                : "An unexpected error occurred. You can try again, and if the problem persists please contact support."}
            </p>
            {error.digest && (
              <p className="mt-3 text-xs text-text-muted font-mono">Ref: {error.digest}</p>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={reset} variant="primary">
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Try again
              </Button>
              <Link href="/">
                <Button variant="secondary">
                  <Home className="mr-1.5 h-4 w-4" />
                  Go home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

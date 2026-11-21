"use client";

import Link from "next/link";
import { WifiOff, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function OfflinePage() {
  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border-subtle bg-surface-muted text-text-muted shadow-fluent-4">
        <WifiOff className="h-8 w-8 text-text-secondary" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
        You are currently offline
      </h1>
      <p className="mt-2 max-w-sm text-sm text-text-muted">
        Vaulty couldn&apos;t connect to the network. Please check your internet connection and try
        again.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={handleReload} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>Retry Connection</span>
        </Button>
        <Link href="/dashboard">
          <Button variant="secondary" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Go to Dashboard</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

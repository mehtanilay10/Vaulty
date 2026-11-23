"use client";

import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";

export function SiteFooter() {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  // Omit global footer on authenticated app pages and auth pages,
  // where AppShell / AuthShell already render the unified footer inside the layout.
  const isAppOrAuthPage =
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/documents") ||
    pathname?.startsWith("/wealth") ||
    pathname?.startsWith("/credentials") ||
    pathname?.startsWith("/reminders") ||
    pathname?.startsWith("/chat") ||
    pathname?.startsWith("/email-sync") ||
    pathname?.startsWith("/family") ||
    pathname?.startsWith("/notes") ||
    pathname?.startsWith("/settings") ||
    pathname?.startsWith("/notifications") ||
    pathname?.startsWith("/auth");

  if (isAppOrAuthPage) {
    return null;
  }

  return (
    <footer
      className="site-footer border-t border-border-subtle bg-surface/40 py-3.5 text-xs text-text-muted select-none"
      aria-label="Site footer"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
        <p className="text-xs text-text-muted text-left">© {year} Vaulty. All rights reserved.</p>
        <p className="text-xs text-text-muted text-right">
          Made with{" "}
          <Heart className="mx-0.5 inline-block h-3.5 w-3.5 fill-rose-500 text-rose-500 align-text-bottom" />{" "}
          by{" "}
          <a
            href="https://mnilay.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-text-primary underline decoration-brand/50 underline-offset-4 transition-colors hover:text-brand"
          >
            Nilay Mehta
          </a>
        </p>
      </div>
    </footer>
  );
}

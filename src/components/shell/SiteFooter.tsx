"use client";

import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";

export function SiteFooter() {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  // Omit global footer on auth pages so login/verification flows fit without scrolling
  if (pathname?.startsWith("/auth")) {
    return null;
  }

  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer__inner">
        <div className="site-footer__bottom flex flex-col sm:flex-row items-center justify-between gap-2.5">
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
      </div>
    </footer>
  );
}

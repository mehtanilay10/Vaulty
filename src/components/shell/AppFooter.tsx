import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppFooter({ className }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "border-t border-border-subtle bg-surface/50 py-3.5 text-xs text-text-muted select-none",
        className,
      )}
      aria-label="App footer"
    >
      <div className="mx-auto flex max-w-[1480px] flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6 lg:px-7">
        <p className="text-xs text-text-muted text-left">
          © {currentYear} Vaulty. All rights reserved.
        </p>
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

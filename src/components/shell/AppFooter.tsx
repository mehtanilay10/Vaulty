import { cn } from "@/lib/utils";

export function AppFooter({ className }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "border-t border-border-subtle bg-surface/40 py-3.5 text-xs text-text-muted select-none",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
        <p className="tracking-tight">© {currentYear} Vaulty. All rights reserved.</p>
        <p className="flex items-center gap-1.5 text-text-secondary">
          <span>Made with</span>
          <span className="text-rose-500 inline-block animate-pulse" aria-label="love">
            ❤️
          </span>
          <span>for private sovereign data</span>
        </p>
      </div>
    </footer>
  );
}

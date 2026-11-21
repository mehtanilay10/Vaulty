import { cn } from "@/lib/utils";

export function LoadingSpinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-label="Loading"
    />
  );
}

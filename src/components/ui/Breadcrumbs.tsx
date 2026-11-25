import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-0.5 overflow-x-auto text-[13px] leading-5 text-text-muted",
        className,
      )}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={`${item.label}-${index}`} className="flex shrink-0 items-center gap-0.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-text-muted/60" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="rounded px-1.5 py-0.5 transition-colors hover:bg-surface-muted hover:text-text-primary"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn("truncate px-1.5 py-0.5", isLast && "font-medium text-text-primary")}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

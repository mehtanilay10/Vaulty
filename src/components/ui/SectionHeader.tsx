import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  icon,
  count,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface text-text-secondary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[14.5px] font-semibold tracking-tight text-text-primary">
              {title}
            </h2>
            {typeof count === "number" && (
              <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-secondary border border-border-subtle tabular-nums">
                {count}
              </span>
            )}
          </div>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

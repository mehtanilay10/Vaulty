import { cn } from "@/lib/utils";

const tones = {
  brand: "border-brand/15 bg-brand-subtle text-brand",
  violet: "border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400",
  emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rose: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  sky: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
} as const;

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: keyof typeof tones;
  actions?: React.ReactNode;
  eyebrow?: string;
  className?: string;
  compact?: boolean;
  truncateTitle?: boolean;
}

export function PageHeader({
  title,
  description,
  icon,
  tone = "brand",
  actions,
  eyebrow,
  className,
  compact = false,
  truncateTitle = false,
}: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-col justify-between gap-4 sm:flex-row sm:items-center", className)}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && !compact && (
          <div
            className={cn(
              "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm",
              tones[tone],
            )}
          >
            {icon}
          </div>
        )}
        {icon && compact && (
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
              tones[tone],
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="section-eyebrow mb-1">{eyebrow}</p>}
          <h1
            className={cn(
              "font-semibold leading-8 tracking-tight text-text-primary",
              truncateTitle ? "truncate" : "break-words",
              compact ? "text-[1.4rem]" : "text-[1.6rem] sm:text-[1.75rem]",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-xs leading-5 text-text-secondary sm:text-[13px] sm:leading-6">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

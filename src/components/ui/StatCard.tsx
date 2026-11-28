import Link from "next/link";
import { cn } from "@/lib/utils";

const tones = {
  brand: {
    bar: "bg-brand",
    icon: "text-brand",
    value: "text-text-primary",
  },
  success: {
    bar: "bg-success",
    icon: "text-success",
    value: "text-text-primary",
  },
  warning: {
    bar: "bg-warning",
    icon: "text-warning",
    value: "text-text-primary",
  },
  danger: {
    bar: "bg-danger",
    icon: "text-danger",
    value: "text-text-primary",
  },
  info: {
    bar: "bg-info",
    icon: "text-info",
    value: "text-text-primary",
  },
  neutral: {
    bar: "bg-text-muted",
    icon: "text-text-secondary",
    value: "text-text-primary",
  },
  violet: {
    bar: "bg-purple-600 dark:bg-purple-400",
    icon: "text-purple-600 dark:text-purple-400",
    value: "text-text-primary",
  },
  emerald: {
    bar: "bg-emerald-600 dark:bg-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
    value: "text-text-primary",
  },
  amber: {
    bar: "bg-amber-600 dark:bg-amber-400",
    icon: "text-amber-600 dark:text-amber-400",
    value: "text-text-primary",
  },
  rose: {
    bar: "bg-rose-600 dark:bg-rose-400",
    icon: "text-rose-600 dark:text-rose-400",
    value: "text-text-primary",
  },
  sky: {
    bar: "bg-sky-600 dark:bg-sky-400",
    icon: "text-sky-600 dark:text-sky-400",
    value: "text-text-primary",
  },
} as const;

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
  tone?: keyof typeof tones;
  href?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "brand",
  href,
  className,
}: StatCardProps) {
  const style = tones[tone];

  const inner = (
    <div
      className={cn(
        "card relative flex h-full flex-col justify-between overflow-hidden p-4 sm:p-4.5 transition-all duration-200",
        href &&
          "group cursor-pointer hover:-translate-y-0.5 hover:border-brand/40 hover:bg-surface-elevated hover:shadow-fluent-8",
        className,
      )}
    >
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-[2px] opacity-75 transition-opacity duration-200",
          href && "group-hover:h-[3px] group-hover:opacity-100",
          style.bar,
        )}
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "shrink-0 transition-transform duration-200",
              href && "group-hover:scale-110",
              style.icon,
            )}
          >
            {icon}
          </span>
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted transition-colors group-hover:text-text-secondary">
            {label}
          </p>
        </div>
        {hint && (
          <span className="shrink-0 rounded border border-border-subtle bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-secondary">
            {hint}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p
          className={cn(
            "text-[1.6rem] font-semibold leading-8 tracking-tight tabular-nums",
            style.value,
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }

  return inner;
}

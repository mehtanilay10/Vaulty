import Link from "next/link";
import { cn } from "@/lib/utils";

const tones = {
  brand: {
    tile: "bg-brand-subtle text-brand border-brand/15",
    value: "text-text-primary",
  },
  success: {
    tile: "bg-success-subtle text-success border-success/20",
    value: "text-text-primary",
  },
  warning: {
    tile: "bg-warning-subtle text-warning border-warning/25",
    value: "text-text-primary",
  },
  danger: {
    tile: "bg-danger-subtle text-danger border-danger/20",
    value: "text-text-primary",
  },
  info: {
    tile: "bg-info-subtle text-info border-info/20",
    value: "text-text-primary",
  },
  neutral: {
    tile: "bg-surface-muted text-text-secondary border-border-subtle",
    value: "text-text-primary",
  },
  violet: {
    tile: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    value: "text-text-primary",
  },
  emerald: {
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    value: "text-text-primary",
  },
  amber: {
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    value: "text-text-primary",
  },
  rose: {
    tile: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    value: "text-text-primary",
  },
  sky: {
    tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
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
        "card flex h-full flex-col justify-between p-4.5 transition-all duration-150",
        href && "card-hover",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-8.5 w-8.5 items-center justify-center rounded-md border",
            style.tile,
          )}
        >
          {icon}
        </div>
        {hint && (
          <span className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-0.5 text-[10px] font-semibold text-text-muted">
            {hint}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className={cn("text-[1.65rem] font-semibold leading-8 tracking-tight", style.value)}>
          {value}
        </p>
        <p className="mt-0.5 text-xs font-medium text-text-muted">{label}</p>
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

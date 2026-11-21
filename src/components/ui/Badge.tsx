import { cn } from "@/lib/utils";

export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?:
    | "default"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "brand"
    | "violet"
    | "emerald"
    | "amber"
    | "rose"
    | "sky";
  className?: string;
  children: React.ReactNode;
}) {
  const variants = {
    default: "bg-surface-muted text-text-secondary border border-border-subtle",
    success: "bg-success-subtle text-success border border-success/20",
    warning: "bg-warning-subtle text-warning border border-warning/25",
    danger: "bg-danger-subtle text-danger border border-danger/20",
    info: "bg-info-subtle text-info border border-info/20",
    brand: "bg-brand-subtle text-brand border border-brand/20",
    violet: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
    emerald:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20",
  };

  return <span className={cn("badge", variants[variant], className)}>{children}</span>;
}

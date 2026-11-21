import { cn } from "@/lib/utils";

export function Alert({
  variant = "default",
  className,
  children,
}: {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
  children: React.ReactNode;
}) {
  const variants = {
    default: "bg-surface-muted border-border text-text-secondary border-l-text-muted",
    success: "bg-success-subtle border-success/20 text-success border-l-success",
    warning: "bg-warning-subtle border-warning/25 text-warning border-l-warning",
    danger: "bg-danger-subtle border-danger/20 text-danger border-l-danger",
    info: "bg-info-subtle border-info/20 text-info border-l-info",
  };

  return <div className={cn("alert border", variants[variant], className)}>{children}</div>;
}

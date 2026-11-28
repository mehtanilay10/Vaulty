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
    default: "bg-surface-muted/80 border-border text-text-secondary",
    success: "bg-success-subtle border-success/25 text-success",
    warning: "bg-warning-subtle border-warning/25 text-warning",
    danger: "bg-danger-subtle border-danger/25 text-danger",
    info: "bg-info-subtle border-info/25 text-info",
  };

  return <div className={cn("alert border", variants[variant], className)}>{children}</div>;
}

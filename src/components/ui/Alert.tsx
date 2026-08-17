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
    default: "bg-surface-muted border-border-subtle text-text-secondary",
    success: "bg-success-subtle border-success/20 text-success",
    warning: "bg-warning-subtle border-warning/20 text-warning",
    danger: "bg-danger-subtle border-danger/20 text-danger",
    info: "bg-info-subtle border-info/20 text-info",
  };

  return (
    <div className={cn("alert border", variants[variant], className)}>
      {children}
    </div>
  );
}

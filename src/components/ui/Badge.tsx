import { cn } from "@/lib/utils";

export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
  children: React.ReactNode;
}) {
  const variants = {
    default: "bg-surface-muted text-text-secondary border border-border-subtle",
    success: "bg-success-subtle text-success border border-success/20",
    warning: "bg-warning-subtle text-warning border border-warning/20",
    danger: "bg-danger-subtle text-danger border border-danger/20",
    info: "bg-info-subtle text-info border border-info/20",
  };

  return (
    <span className={cn("badge", variants[variant], className)}>
      {children}
    </span>
  );
}

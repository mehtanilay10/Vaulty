import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-5 py-12 text-center", className)}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-muted/70 text-text-secondary">
          {icon}
        </div>
      )}
      <h3 className="mb-1 text-[14.5px] font-semibold tracking-tight text-text-primary">{title}</h3>
      {description && (
        <p className="max-w-sm text-[12.5px] leading-relaxed text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

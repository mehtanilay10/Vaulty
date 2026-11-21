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
      className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-brand/15 bg-brand-subtle text-brand shadow-fluent-2">
          {icon}
        </div>
      )}
      <h3 className="mb-1 text-[15px] font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="max-w-sm text-[13px] leading-relaxed text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

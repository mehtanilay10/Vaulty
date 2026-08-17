import { cn } from "@/lib/utils";

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center gap-1 border-b border-border-subtle overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

export function Tab({
  value,
  active,
  onClick,
  icon,
  children,
}: {
  value: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
        active
          ? "border-brand text-brand"
          : "border-transparent text-text-muted hover:text-text-primary"
      )}
    >
      {icon && <span className={cn(active ? "text-brand" : "text-text-muted")}>{icon}</span>}
      {children}
    </button>
  );
}

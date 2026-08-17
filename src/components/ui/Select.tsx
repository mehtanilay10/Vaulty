import { cn } from "@/lib/utils";

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("input h-9 px-3 py-1.5 text-sm", className)}
      {...props}
    >
      {children}
    </select>
  );
}

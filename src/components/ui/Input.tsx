import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("input h-9 px-3 py-1.5 text-sm", className)}
      {...props}
    />
  );
}

import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "input min-h-[80px] px-3 py-2 text-sm",
        className
      )}
      {...props}
    />
  );
}

import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  hover = false,
  elevated = false,
}: {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  elevated?: boolean;
}) {
  return (
    <div
      className={cn(
        elevated ? "card-elevated" : "card",
        hover && "card-hover",
        "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("pb-4", className)}>{children}</div>
  );
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("py-4", className)}>{children}</div>
  );
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("pt-4 border-t border-border-subtle", className)}>
      {children}
    </div>
  );
}

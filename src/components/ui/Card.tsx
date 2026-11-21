import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  hover = false,
  elevated = false,
  padding = "default",
}: {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  elevated?: boolean;
  padding?: "none" | "default" | "compact";
}) {
  const paddingClasses = {
    none: "",
    default: "p-5",
    compact: "p-3",
  };

  return (
    <div
      className={cn(
        elevated ? "card-elevated" : "card",
        hover && "card-hover",
        paddingClasses[padding],
        className,
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
  return <div className={cn("flex flex-col gap-1 pb-4", className)}>{children}</div>;
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("flex flex-col gap-1 py-4", className)}>{children}</div>;
}

export function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("pt-4 border-t border-border-subtle", className)}>{children}</div>;
}

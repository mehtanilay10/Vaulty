import { cn } from "@/lib/utils";

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium transition-all cursor-pointer";

  const variants = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger: "btn-danger",
  };

  const sizes = {
    sm: "h-8 px-3 text-[11px] sm:text-xs rounded-md",
    md: "h-9 px-4 text-xs sm:text-sm rounded-md",
    lg: "h-11 px-6 text-sm sm:text-base rounded-md",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

interface AvatarProps {
  name?: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const initials =
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const sizeClasses = {
    sm: "w-7 h-7 text-[10px]",
    md: "w-8 h-8 text-xs",
    lg: "w-10 h-10 text-sm",
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name || "Avatar"}
        className={cn("rounded-md object-cover ring-2 ring-brand/20", sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-md bg-brand-subtle text-brand font-bold flex items-center justify-center ring-1 ring-brand/20",
        sizeClasses[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}

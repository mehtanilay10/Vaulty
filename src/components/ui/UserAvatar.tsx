/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm font-semibold",
  xl: "h-14 w-14 text-xl font-bold",
};

export function UserAvatar({ src, name, email, size = "md", className }: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const letter = (name?.[0] || email?.[0] || "U").toUpperCase();

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name || "User Avatar"}
        onError={() => setHasError(true)}
        className={cn(
          "shrink-0 rounded-lg object-cover ring-1 ring-border-subtle",
          SIZES[size],
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand font-bold ring-1 ring-brand/20 select-none shadow-sm",
        SIZES[size],
        className,
      )}
      aria-label={name || email || "User Avatar"}
    >
      {letter}
    </div>
  );
}

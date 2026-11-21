"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn("input h-9 w-full px-3 py-1.5 text-sm cursor-pointer", className)}
      {...props}
    >
      {children}
    </select>
  ),
);

Select.displayName = "Select";

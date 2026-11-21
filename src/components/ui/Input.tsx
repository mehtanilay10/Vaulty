"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("input h-9 w-full px-3 py-1.5 text-sm", className)} {...props} />
  ),
);

Input.displayName = "Input";

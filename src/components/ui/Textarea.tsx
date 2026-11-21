"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "input w-full min-h-[80px] px-3 py-2 text-sm resize-y leading-relaxed",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";

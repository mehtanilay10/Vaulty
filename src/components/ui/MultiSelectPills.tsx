"use client";

import { useState, useRef, useEffect, useId, type KeyboardEvent } from "react";
import { X, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string | number;
  label: string;
  hint?: string;
}

interface MultiSelectPillsProps {
  value: Array<string | number>;
  onChange: (value: Array<string | number>) => void;
  options?: MultiSelectOption[];
  placeholder?: string;
  allowCustom?: boolean;
  className?: string;
  badgeClassName?: string;
  disabled?: boolean;
  id?: string;
}

export function MultiSelectPills({
  value = [],
  onChange,
  options = [],
  placeholder = "Select or type...",
  allowCustom = false,
  className,
  badgeClassName,
  disabled = false,
  id,
}: MultiSelectPillsProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const inputId = id || generatedId;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedSet = new Set(value.map(String));

  const handleSelectOption = (optValue: string | number) => {
    const strVal = String(optValue);
    if (selectedSet.has(strVal)) {
      onChange(value.filter((v) => String(v) !== strVal));
    } else {
      onChange([...value, optValue]);
    }
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleRemovePill = (valToRemove: string | number) => {
    onChange(value.filter((v) => String(v) !== String(valToRemove)));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "Backspace" && !inputValue && value.length > 0) {
      // Remove the last pill
      onChange(value.slice(0, -1));
      return;
    }

    if ((e.key === "Enter" || e.key === ",") && allowCustom) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/^,+|,+$/g, "");
      if (trimmed && !selectedSet.has(trimmed.toLowerCase())) {
        onChange([...value, trimmed]);
        setInputValue("");
      }
    }

    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleBlur = () => {
    if (allowCustom && inputValue.trim()) {
      const trimmed = inputValue.trim().replace(/^,+|,+$/g, "");
      if (trimmed && !selectedSet.has(trimmed.toLowerCase())) {
        onChange([...value, trimmed]);
        setInputValue("");
      }
    }
  };

  // Filter options based on input value if typed
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const getLabelForValue = (val: string | number): string => {
    const matched = options.find((opt) => String(opt.value) === String(val));
    return matched ? matched.label : String(val);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
        className={cn(
          "flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs transition-colors cursor-text",
          open ? "border-brand ring-2 ring-brand-subtle" : "hover:border-text-muted",
          disabled && "cursor-not-allowed opacity-50 bg-surface-muted hover:border-border",
        )}
      >
        {/* Render Pills */}
        {value.map((val) => {
          const label = getLabelForValue(val);
          return (
            <span
              key={String(val)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border animate-in fade-in zoom-in-95 duration-100",
                badgeClassName || "bg-brand/10 border-brand/20 text-brand",
              )}
            >
              <span>{label}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemovePill(val);
                  }}
                  className="rounded-full p-0.5 hover:bg-brand/20 text-brand transition-colors"
                  aria-label={`Remove ${label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}

        {/* Input - completely stripped of default global input borders and rings */}
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
          style={{
            border: "none",
            outline: "none",
            boxShadow: "none",
            background: "transparent",
          }}
          className="min-w-[80px] flex-1 !border-0 !border-none !bg-transparent p-0 text-xs text-text-primary placeholder:text-text-muted !outline-none !shadow-none !ring-0 focus:!border-0 focus:!border-none focus:!outline-none focus:!shadow-none focus:!ring-0 disabled:cursor-not-allowed"
        />

        {options.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((prev) => !prev);
            }}
            disabled={disabled}
            className="text-text-muted hover:text-text-primary p-1"
            tabIndex={-1}
            aria-label="Toggle options dropdown"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")}
            />
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {open && options.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-xl border border-border-subtle bg-surface-elevated py-1 shadow-fluent-16">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted italic">
              {allowCustom ? "Press Enter or comma to add custom value" : "No matching options"}
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = selectedSet.has(String(opt.value));
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => handleSelectOption(opt.value)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-xs text-left transition-colors hover:bg-surface-muted",
                    isSelected && "font-semibold text-brand bg-brand/5",
                  )}
                >
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="text-[10px] text-text-muted font-normal">{opt.hint}</span>
                    )}
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-brand shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

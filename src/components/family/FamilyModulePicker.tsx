"use client";

import {
  emptyFamilyModuleFlags,
  FAMILY_MODULES,
  FAMILY_MODULE_DESCRIPTIONS,
  FAMILY_MODULE_FIELD,
  FAMILY_MODULE_LABELS,
  type FamilyModule,
  type FamilyModuleFlags,
} from "@/types/family";
import { Checkbox } from "@/components/ui/Checkbox";
import { BellRing, FileText, Lock, StickyNote, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_MODULE_CONFIG = {
  icon: FileText,
  iconTile: "bg-surface-muted text-text-muted border-border-subtle",
  checkedClass: "border-border-strong bg-surface-muted/30",
};

const MODULE_CONFIG: Record<
  FamilyModule,
  {
    icon: React.ElementType;
    iconTile: string;
    checkedClass: string;
  }
> = {
  documents: {
    icon: FileText,
    iconTile: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    checkedClass: "border-blue-500/30 bg-blue-500/5",
  },
  wealth: {
    icon: Wallet,
    iconTile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    checkedClass: "border-emerald-500/30 bg-emerald-500/5",
  },
  credentials: {
    icon: Lock,
    iconTile: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    checkedClass: "border-purple-500/30 bg-purple-500/5",
  },
  reminders: {
    icon: BellRing,
    iconTile: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    checkedClass: "border-amber-500/30 bg-amber-500/5",
  },
  notes: {
    icon: StickyNote,
    iconTile: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    checkedClass: "border-teal-500/30 bg-teal-500/5",
  },
};

export function FamilyModulePicker({
  flags,
  onChange,
  disabled = false,
}: {
  flags: FamilyModuleFlags;
  onChange: (flags: FamilyModuleFlags) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2.5">
      {FAMILY_MODULES.map((module) => {
        const config = (module && MODULE_CONFIG[module]) || DEFAULT_MODULE_CONFIG;
        const Icon = config.icon || FileText;
        const field = FAMILY_MODULE_FIELD[module];
        const checked = Boolean(field && flags?.[field]);

        return (
          <label
            key={module}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all",
              checked ? config.checkedClass : "border-border-subtle bg-surface hover:border-border",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onChange={(event) => {
                if (!field) return;
                onChange({
                  ...(flags || emptyFamilyModuleFlags()),
                  [field]: event.target.checked,
                });
              }}
              className="mt-0.5"
            />
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                  config.iconTile,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                  {FAMILY_MODULE_LABELS[module] || module}
                  <Lock className="h-3 w-3 text-text-muted" />
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
                  {FAMILY_MODULE_DESCRIPTIONS[module] || ""}
                </span>
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

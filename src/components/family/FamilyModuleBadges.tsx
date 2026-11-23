import { Badge } from "@/components/ui/Badge";
import {
  FAMILY_MODULES,
  FAMILY_MODULE_LABELS,
  isFamilyModuleShared,
  type FamilyModule,
  type FamilyModuleFlags,
} from "@/types/family";
import { BellRing, FileText, Lock, StickyNote, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  documents: FileText,
  wealth: Wallet,
  credentials: Lock,
  reminders: BellRing,
  notes: StickyNote,
};

const MODULE_VARIANTS: Record<FamilyModule, "brand" | "emerald" | "violet" | "amber" | "info"> = {
  documents: "brand",
  wealth: "emerald",
  credentials: "violet",
  reminders: "amber",
  notes: "info",
};

export function FamilyModuleBadges({
  flags,
  className,
}: {
  flags: FamilyModuleFlags;
  className?: string;
}) {
  if (!flags) {
    return <span className="text-[11px] text-text-muted">No modules shared</span>;
  }

  const active = FAMILY_MODULES.filter((module) => isFamilyModuleShared(flags, module));

  if (active.length === 0) {
    return <span className="text-[11px] text-text-muted">No modules shared</span>;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {active.map((module) => {
        const Icon = (module && ICONS[module]) || FileText;
        const variant = (module && MODULE_VARIANTS[module]) || "brand";
        const label = (module && FAMILY_MODULE_LABELS[module]) || module;
        return (
          <Badge key={module} variant={variant} className="gap-1.5 font-medium">
            <Icon className="h-3 w-3" />
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

"use client";

import { Modal } from "@/components/ui/Modal";
import { Search, FileText, Sparkles } from "lucide-react";

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  icon: React.ElementType;
  items: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global & Navigation",
    icon: Search,
    items: [
      { keys: ["Ctrl", "K"], description: "Open Universal Search / Omnibox" },
      { keys: ["/"], description: "Focus Universal Search when idle" },
      { keys: ["Esc"], description: "Close search, dialogs, drawers, or modals" },
      { keys: ["Tab"], description: "Navigate between interactive controls" },
    ],
  },
  {
    title: "Omnibox / Command Palette",
    icon: Sparkles,
    items: [
      { keys: ["↑", "↓"], description: "Select previous / next search result" },
      { keys: ["Enter"], description: "Navigate to selected item or page" },
      { keys: ["Esc"], description: "Close Command Palette and return focus" },
    ],
  },
  {
    title: "Document Viewer",
    icon: FileText,
    items: [
      { keys: ["Esc"], description: "Exit full-screen preview mode" },
      { keys: ["Page Up", "Page Down"], description: "Scroll multi-page PDF documents" },
    ],
  },
];

export function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      description="Navigate Vaulty faster using your keyboard."
      maxWidth="lg"
      fullScreenMobile={true}
    >
      <div className="space-y-6 py-1">
        {SHORTCUT_GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.title} className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <Icon className="h-3.5 w-3.5 text-brand" />
                <span>{group.title}</span>
              </div>

              <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-muted/30">
                {group.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-4 px-3.5 py-2.5 text-xs"
                  >
                    <span className="text-text-primary font-medium flex-1 min-w-[140px]">
                      {item.description}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.keys.map((key, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-border-subtle bg-surface px-2 py-1 font-mono text-[11px] font-semibold text-text-primary shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

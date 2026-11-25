"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  StickyNote,
  Plus,
  Search,
  Pin,
  Trash2,
  Palette,
  ArrowLeft,
  Users,
  Loader2,
  Calendar,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton, CommandBarDivider } from "@/components/ui/CommandBar";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { NoteEditor } from "@/components/notes/NoteEditor";
import type { NotePageItem } from "@/types/notes";

const NOTE_COLORS = [
  {
    label: "Default",
    value: null,
    bgClass: "bg-surface-muted",
    borderClass: "border-border-subtle",
  },
  { label: "Teal", value: "#0d9488", bgClass: "bg-teal-500/10", borderClass: "border-teal-500/40" },
  { label: "Blue", value: "#2563eb", bgClass: "bg-blue-500/10", borderClass: "border-blue-500/40" },
  {
    label: "Purple",
    value: "#9333ea",
    bgClass: "bg-purple-500/10",
    borderClass: "border-purple-500/40",
  },
  {
    label: "Emerald",
    value: "#059669",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/40",
  },
  {
    label: "Amber",
    value: "#d97706",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/40",
  },
  { label: "Rose", value: "#e11d48", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/40" },
];

function formatNoteDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return dateStr;
  }
}

interface NotesClientProps {
  initialNotes: NotePageItem[];
  hasFamilyNotes?: boolean;
}

export function NotesClient({ initialNotes, hasFamilyNotes = false }: NotesClientProps) {
  const { toast, confirmAction } = useFeedback();

  // Pages state
  const [notes, setNotes] = useState<NotePageItem[]>(initialNotes);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    initialNotes.length > 0 ? initialNotes[0].id : null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPinnedOnly, setFilterPinnedOnly] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "editor">("list");

  // Active note draft
  const activeNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) || null,
    [notes, selectedNoteId],
  );

  const [draftTitle, setDraftTitle] = useState("");
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const [draftIsPinned, setDraftIsPinned] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [savingStatus, setSavingStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // Save debounce timer & dirty tracking
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dirtyRef = useRef(false);
  const searchParams = useSearchParams();
  const hasTriggeredActionRef = useRef(false);

  // Latest draft snapshot for debounced saves (avoids stale closures)
  const draftRef = useRef({
    title: "",
    color: null as string | null,
    isPinned: false,
    content: "",
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  // Sync draft when the selected note changes (not on every save echo)
  useEffect(() => {
    const note = notes.find((n) => n.id === selectedNoteId) || null;
    if (note) {
      setDraftTitle(note.title || "");
      setDraftColor(note.color || null);
      setDraftIsPinned(note.isPinned || false);

      setDraftContent(note.content || "");
      dirtyRef.current = false;
      setSavingStatus("saved");
    } else {
      setDraftTitle("");
      setDraftColor(null);
      setDraftIsPinned(false);
      setDraftContent("");
      dirtyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNoteId]);

  // Keep draft snapshot ref in sync for debounced saves
  useEffect(() => {
    draftRef.current = {
      title: draftTitle,
      color: draftColor,
      isPinned: draftIsPinned,
      content: draftContent,
    };
  }, [draftTitle, draftColor, draftIsPinned, draftContent]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Filtered notes list (flat pages)
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (filterPinnedOnly && !n.isPinned) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = n.title.toLowerCase().includes(q);
      const matchContent = (n.content || "").toLowerCase().includes(q);
      return matchTitle || matchContent;
    });
  }, [notes, searchQuery, filterPinnedOnly]);

  // Save changes to API
  const persistNote = useCallback(
    async (
      id: string,
      payload: {
        title?: string;
        content?: string | null;
        color?: string | null;
        isPinned?: boolean;
      },
    ) => {
      setSavingStatus("saving");
      try {
        const res = await fetch(`/api/notes/${id}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error("Failed to save note");
        }

        const data = await res.json();
        const updated = data.note as NotePageItem;

        // Update local list
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        setSavingStatus("saved");
      } catch (err) {
        console.error("Error persisting note:", err);
        setSavingStatus("unsaved");
      }
    },
    [],
  );

  // Debounced auto-save for content/title edits
  const scheduleAutoSave = useCallback(() => {
    if (!selectedNoteId) return;
    dirtyRef.current = true;
    setSavingStatus("unsaved");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      if (!dirtyRef.current || !selectedNoteId) return;
      dirtyRef.current = false;
      const d = draftRef.current;
      persistNote(selectedNoteId, {
        title: d.title.trim() || "Untitled Page",
        content: d.content,
        color: d.color,
        isPinned: d.isPinned,
      });
    }, 800);
  }, [selectedNoteId, persistNote]);

  // Flush any pending debounced save (e.g. before switching notes)
  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!dirtyRef.current || !selectedNoteId) return;
    dirtyRef.current = false;
    const d = draftRef.current;
    void persistNote(selectedNoteId, {
      title: d.title.trim() || "Untitled Page",
      content: d.content,
      color: d.color,
      isPinned: d.isPinned,
    });
  }, [selectedNoteId, persistNote]);

  // Handle Title input change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    draftRef.current.title = e.target.value;
    setDraftTitle(e.target.value);
    scheduleAutoSave();
  };

  // Handle markdown content change from the editor
  const handleContentChange = useCallback(
    (markdown: string) => {
      draftRef.current.content = markdown;
      setDraftContent(markdown);
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  // Create new page
  const handleCreatePage = useCallback(async () => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: "Untitled Page",
        }),
      });

      if (!res.ok) throw new Error("Failed to create page");
      const data = await res.json();
      const newPage = data.note as NotePageItem;

      setNotes((prev) => [newPage, ...prev]);
      setSelectedNoteId(newPage.id);
      setMobileView("editor");
      toast("New page created", "success");
    } catch {
      toast("Failed to create new page", "error");
    }
  }, [toast]);

  useEffect(() => {
    if (searchParams?.get("action") === "new" && !hasTriggeredActionRef.current) {
      hasTriggeredActionRef.current = true;
      handleCreatePage();
    }
  }, [searchParams, handleCreatePage]);

  // Delete page
  const handleDeletePage = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const confirmed = await confirmAction({
      title: "Delete page?",
      description: "Are you sure you want to delete this page permanently?",
      confirmLabel: "Delete page",
      tone: "danger",
    });
    if (!confirmed) return;
    flushPendingSave();

    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete page");

      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNoteId === id) {
        const remaining = notes.filter((n) => n.id !== id);
        setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast("Page deleted", "info");
    } catch {
      toast("Failed to delete page", "error");
    }
  };

  // Pin toggle
  const handleTogglePin = async (id: string, currentPin: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextPin = !currentPin;
    if (id === selectedNoteId) {
      draftRef.current.isPinned = nextPin;
      setDraftIsPinned(nextPin);
    }
    await persistNote(id, { isPinned: nextPin });
  };

  // Color change
  const handleColorChange = async (color: string | null) => {
    draftRef.current.color = color;
    setDraftColor(color);
    setColorPickerOpen(false);
    if (selectedNoteId) {
      await persistNote(selectedNoteId, { color });
    }
  };

  return (
    <>
      <div className="space-y-3">
        <PageHeader title="Notes" />

        <CommandBar>
          <CommandBarButton
            primary
            icon={<Plus className="h-3.5 w-3.5 text-white" />}
            onClick={handleCreatePage}
          >
            New Page
          </CommandBarButton>
          {hasFamilyNotes && (
            <>
              <CommandBarDivider />
              <CommandBarButton
                icon={<Users className="h-3.5 w-3.5" />}
                item={{ key: "family-notes", label: "Family Notes", href: "/family/notes" }}
              />
            </>
          )}
        </CommandBar>
      </div>

      {/* Main split canvas: Flat List of Pages (Left) | OneNote Page Canvas (Right) */}
      <div className="mt-4 flex flex-col lg:flex-row gap-4 h-[calc(100vh-210px)] min-h-[600px]">
        {/* Left Pane: Flat List of Pages */}
        <div
          className={cn(
            "w-full lg:w-80 shrink-0 flex flex-col rounded-xl border border-border-subtle bg-surface shadow-xs overflow-hidden",
            mobileView === "editor" ? "hidden lg:flex" : "flex",
          )}
        >
          {/* Top search & filter */}
          <div className="p-3 border-b border-border-subtle bg-surface space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pages..."
                className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border-subtle bg-surface-muted/60 text-text-primary focus:outline-none focus:border-brand"
              />
            </div>
            <div className="flex items-center justify-between text-xs px-1">
              <button
                type="button"
                onClick={() => setFilterPinnedOnly((prev) => !prev)}
                className={cn(
                  "inline-flex items-center gap-1 font-medium transition-colors",
                  filterPinnedOnly ? "text-brand" : "text-text-muted hover:text-text-primary",
                )}
              >
                <Pin className="h-3 w-3" />
                Pinned only
              </button>
              <span className="text-text-muted">{filteredNotes.length} pages</span>
            </div>
          </div>

          {/* Flat Pages List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/50">
            {filteredNotes.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted">
                <StickyNote className="h-8 w-8 mx-auto text-text-muted/50 mb-2" />
                <p className="font-semibold text-text-secondary">No pages found</p>
                <p className="mt-1">Click &quot;New Page&quot; to write your first note.</p>
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isSelected = note.id === selectedNoteId;
                const noteColor = note.color || null;
                const borderLeftStyle = noteColor
                  ? { borderLeftColor: noteColor, borderLeftWidth: "4px" }
                  : {};

                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      flushPendingSave();
                      setSelectedNoteId(note.id);
                      setMobileView("editor");
                    }}
                    style={borderLeftStyle}
                    className={cn(
                      "group p-3 cursor-pointer transition-colors relative text-left",
                      isSelected
                        ? "bg-brand/10 border-l-4 border-l-brand"
                        : "hover:bg-surface-muted/70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <h4
                        className={cn(
                          "text-xs font-semibold truncate flex-1",
                          isSelected ? "text-brand" : "text-text-primary",
                        )}
                      >
                        {note.title || "Untitled Page"}
                      </h4>
                      {note.isPinned && (
                        <Pin className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0 ml-1" />
                      )}
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
                      <span>{formatShortDate(note.updatedAt)}</span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleTogglePin(note.id, note.isPinned, e)}
                          className="p-1 hover:text-amber-500 transition-colors"
                          title={note.isPinned ? "Unpin" : "Pin"}
                        >
                          <Pin className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePage(note.id, e)}
                          className="p-1 hover:text-danger transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: The OneNote Page Canvas */}
        <div
          className={cn(
            "flex-1 flex flex-col rounded-xl border border-border-subtle bg-surface shadow-xs overflow-hidden",
            mobileView === "list" ? "hidden lg:flex" : "flex",
          )}
        >
          {activeNote ? (
            <>
              {/* Page Header Bar (Title, timestamp, save status, pin, color, back) */}
              <div className="p-4 sm:px-6 border-b border-border-subtle bg-surface/80">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 lg:hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMobileView("list")}
                      className="px-2"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={draftTitle}
                      onChange={handleTitleChange}
                      placeholder="Page Title"
                      className="w-full text-xl sm:text-2xl font-bold tracking-tight text-text-primary bg-transparent border-none outline-none focus:ring-0 placeholder:text-text-muted/60"
                    />
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                      <Calendar className="h-3 w-3" />
                      <span>{formatNoteDate(activeNote.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Actions & Saving state */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-text-muted font-medium">
                      {savingStatus === "saving" ? (
                        <span className="flex items-center gap-1 text-brand">
                          <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                        </span>
                      ) : savingStatus === "saved" ? (
                        <span className="flex items-center gap-1 text-success">
                          <Check className="h-3 w-3" /> Saved
                        </span>
                      ) : (
                        <span className="text-amber-500">Unsaved</span>
                      )}
                    </span>

                    {/* Color picker button */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setColorPickerOpen((prev) => !prev)}
                        className="p-1.5 rounded-lg border border-border-subtle text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
                        title="Page color accent"
                      >
                        <Palette className="h-4 w-4" />
                      </button>

                      {colorPickerOpen && (
                        <div className="absolute right-0 top-8 z-20 flex gap-1 rounded-lg border border-border-subtle bg-surface p-1.5 shadow-lg">
                          {NOTE_COLORS.map((c) => (
                            <button
                              key={c.label}
                              type="button"
                              onClick={() => handleColorChange(c.value)}
                              className={cn(
                                "h-5 w-5 rounded-full border border-border-subtle transition-transform hover:scale-110",
                                c.bgClass,
                                draftColor === c.value && "ring-2 ring-brand",
                              )}
                              title={c.label}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTogglePin(activeNote.id, draftIsPinned)}
                      className={cn(
                        "p-1.5 rounded-lg border border-border-subtle transition-colors",
                        draftIsPinned
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                          : "text-text-muted hover:text-text-primary hover:bg-surface-muted",
                      )}
                      title={draftIsPinned ? "Unpin page" : "Pin page"}
                    >
                      <Pin className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePage(activeNote.id)}
                      className="p-1.5 rounded-lg border border-border-subtle text-text-muted hover:text-danger hover:bg-danger-subtle transition-colors"
                      title="Delete page"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Markdown-backed note editor: rich text / markdown source / preview */}
              <NoteEditor content={draftContent} onChange={handleContentChange} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
              <StickyNote className="h-12 w-12 text-brand/30 mb-3" />
              <h3 className="text-base font-semibold text-text-primary">
                Select a page or create a new one
              </h3>
              <p className="text-xs text-text-muted max-w-sm mt-1">
                Take rich notes, format text, paste screenshots, and check off tasks all inside the
                same OneNote page.
              </p>
              <Button onClick={handleCreatePage} className="mt-4" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Create First Page
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

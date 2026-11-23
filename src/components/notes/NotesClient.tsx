"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  StickyNote,
  Plus,
  Search,
  Pin,
  Trash2,
  CheckSquare,
  Image as ImageIcon,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Highlighter,
  Quote,
  Minus,
  Check,
  Palette,
  ArrowLeft,
  Users,
  Loader2,
  Calendar,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shell/PageHeader";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
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
  const [savingStatus, setSavingStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // Editor ref & save debounce timer
  const editorRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();
  const hasTriggeredActionRef = useRef(false);

  // Selected image refs & width state for inline resizing and formatting
  const selectedImageElRef = useRef<HTMLImageElement | null>(null);
  const selectedImageWrapperRef = useRef<HTMLElement | null>(null);
  const [selectedImageWidth, setSelectedImageWidth] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  // Clear selected image when active note changes
  useEffect(() => {
    selectedImageElRef.current = null;
    selectedImageWrapperRef.current = null;
    setSelectedImageWidth(null);
  }, [selectedNoteId]);

  // Sync draft when active note changes
  useEffect(() => {
    if (activeNote) {
      setDraftTitle(activeNote.title || "");
      setDraftColor(activeNote.color || null);
      setDraftIsPinned(activeNote.isPinned || false);

      // Load content into editor innerHTML without triggering dirty state
      if (editorRef.current) {
        editorRef.current.innerHTML = activeNote.content || "";
      }
      setSavingStatus("saved");
    } else {
      setDraftTitle("");
      setDraftColor(null);
      setDraftIsPinned(false);
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
      }
    }
  }, [activeNote]);
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
    setSavingStatus("unsaved");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const currentContent = editorRef.current?.innerHTML || "";
      persistNote(selectedNoteId, {
        title: draftTitle.trim() || "Untitled Page",
        content: currentContent,
        color: draftColor,
        isPinned: draftIsPinned,
      });
    }, 800);
  }, [selectedNoteId, draftTitle, draftColor, draftIsPinned, persistNote]);

  // Handle Title input change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftTitle(e.target.value);
    scheduleAutoSave();
  };

  // Handle Editor content change
  const handleEditorInput = () => {
    scheduleAutoSave();
  };

  // Create new page
  const handleCreatePage = useCallback(async () => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: "Untitled Page",
          content: "<p>Start typing notes, insert tasks with checkboxes, or paste images...</p>",
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
      setDraftIsPinned(nextPin);
    }
    await persistNote(id, { isPinned: nextPin });
  };

  // Color change
  const handleColorChange = async (color: string | null) => {
    setDraftColor(color);
    setColorPickerOpen(false);
    if (selectedNoteId) {
      await persistNote(selectedNoteId, { color });
    }
  };

  // OneNote Formatting Toolbar Executer
  const executeCommand = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    scheduleAutoSave();
  };

  // Insert To-Do Item (Checkbox + Editable Task Text inside note)
  // ALWAYS inserts on a fresh new line, even if cursor is in middle of line
  const handleInsertTodo = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    let insertAfterNode: ChildNode | null = null;

    if (sel && sel.rangeCount > 0) {
      let curr: Node | null = sel.getRangeAt(0).startContainer;

      // Climb up until immediate child of editorRef.current
      while (curr && curr.parentNode && curr.parentNode !== editorRef.current) {
        curr = curr.parentNode;
      }
      if (curr && curr.parentNode === editorRef.current) {
        insertAfterNode = curr as ChildNode;
      }
    }

    const todoDiv = document.createElement("div");
    todoDiv.className =
      "onenote-todo-item flex items-center gap-2.5 my-1.5 p-1 rounded-md hover:bg-surface-muted/40 transition-colors";
    todoDiv.setAttribute("data-todo", "true");
    todoDiv.innerHTML = `
      <input type="checkbox" class="h-4.5 w-4.5 rounded border-border-subtle text-brand focus:ring-brand cursor-pointer accent-brand" />
      <span class="todo-text flex-1 outline-none text-text-primary text-sm" contenteditable="true"></span>
    `;

    if (insertAfterNode && insertAfterNode.parentNode === editorRef.current) {
      // If current line is an empty paragraph (not another todo), replace it; otherwise insert after
      if (
        insertAfterNode.nodeType === Node.ELEMENT_NODE &&
        (insertAfterNode as HTMLElement).textContent?.trim() === "" &&
        !(insertAfterNode as HTMLElement).classList.contains("onenote-todo-item")
      ) {
        insertAfterNode.replaceWith(todoDiv);
      } else {
        insertAfterNode.after(todoDiv);
      }
    } else {
      editorRef.current.appendChild(todoDiv);
    }

    // Ensure there is an empty line below for smooth typing
    if (!todoDiv.nextElementSibling) {
      const p = document.createElement("p");
      p.innerHTML = "<br>";
      todoDiv.after(p);
    }

    const textSpan = todoDiv.querySelector(".todo-text") as HTMLElement | null;
    if (textSpan) {
      textSpan.focus();
      const newRange = document.createRange();
      newRange.setStart(textSpan, 0);
      newRange.collapse(true);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(newRange);
    }
    scheduleAutoSave();
  };

  // Insert Horizontal Rule Divider
  const handleInsertDivider = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<hr class="my-4 border-t border-border-subtle" /><div><br></div>',
    );
    scheduleAutoSave();
  };

  // Insert Image helper (Base64 data URL)
  const insertImageToEditor = (src: string, alt = "Note attachment") => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const imgWrapper = document.createElement("div");
    imgWrapper.className = "onenote-image-wrapper my-3 inline-block max-w-full";
    imgWrapper.style.width = "100%";
    imgWrapper.innerHTML = `
      <img src="${src}" alt="${alt}" class="rounded-xl border border-border-subtle max-w-full object-contain shadow-xs hover:shadow-md transition-shadow cursor-pointer" style="width: 100%; height: auto;" />
    `;

    const sel = window.getSelection();
    let insertAfterNode: ChildNode | null = null;
    if (sel && sel.rangeCount > 0) {
      let curr: Node | null = sel.getRangeAt(0).startContainer;
      while (curr && curr.parentNode && curr.parentNode !== editorRef.current) {
        curr = curr.parentNode;
      }
      if (curr && curr.parentNode === editorRef.current) {
        insertAfterNode = curr as ChildNode;
      }
    }

    if (insertAfterNode && insertAfterNode.parentNode === editorRef.current) {
      insertAfterNode.after(imgWrapper);
    } else {
      editorRef.current.appendChild(imgWrapper);
    }

    // Ensure trailing line for typing
    const p = document.createElement("p");
    p.innerHTML = "<br>";
    imgWrapper.after(p);

    scheduleAutoSave();
  };

  // Handle Pasting Images (OneNote paste experience: Ctrl+V)
  const handleEditorPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const dataUrl = evt.target?.result as string;
            insertImageToEditor(dataUrl, file.name || "Pasted image");
            toast("Image pasted into page", "success");
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  };

  // Handle Drag & Drop of Images into the editor
  const handleEditorDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (evt) => {
          const dataUrl = evt.target?.result as string;
          insertImageToEditor(dataUrl, file.name);
          toast("Image dropped into page", "success");
        };
        reader.readAsDataURL(file);
      }
    }
  };

  // Handle Keyboard shortcuts and Enter / Tab / Ctrl+Enter in Editor
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ctrl+Enter or Cmd+Enter -> insert newline / paragraph break
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      scheduleAutoSave();
      return;
    }

    // Tab -> insert indentation instead of losing focus
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertHTML", false, "&nbsp;&nbsp;&nbsp;&nbsp;");
      scheduleAutoSave();
      return;
    }

    // Inside a Todo item
    const target = e.target as HTMLElement;
    const todoContainer = target?.closest?.(".onenote-todo-item") as HTMLElement | null;
    if (todoContainer && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const textSpan = todoContainer.querySelector(".todo-text") as HTMLElement | null;
      const currentFullText = textSpan?.textContent || "";

      // If current todo item is empty, pressing Enter converts it to an empty paragraph line to exit todo list
      if (currentFullText.trim().length === 0) {
        const p = document.createElement("p");
        p.innerHTML = "<br>";
        todoContainer.replaceWith(p);
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(p, 0);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        scheduleAutoSave();
        return;
      }

      // If cursor is in the middle of text, split text at cursor
      const sel = window.getSelection();
      let textBefore = currentFullText;
      let textAfter = "";

      if (sel && sel.rangeCount > 0 && textSpan && textSpan.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(textSpan);
        preRange.setEnd(range.startContainer, range.startOffset);
        textBefore = preRange.toString();
        textAfter = currentFullText.slice(textBefore.length);
      }

      if (textSpan) {
        textSpan.textContent = textBefore;
      }

      // Create next todo item below
      const nextTodo = document.createElement("div");
      nextTodo.className =
        "onenote-todo-item flex items-center gap-2.5 my-1.5 p-1 rounded-md hover:bg-surface-muted/40 transition-colors";
      nextTodo.setAttribute("data-todo", "true");
      nextTodo.innerHTML = `
        <input type="checkbox" class="h-4.5 w-4.5 rounded border-border-subtle text-brand focus:ring-brand cursor-pointer accent-brand" />
        <span class="todo-text flex-1 outline-none text-text-primary text-sm" contenteditable="true"></span>
      `;
      todoContainer.after(nextTodo);
      const nextSpan = nextTodo.querySelector(".todo-text") as HTMLElement | null;
      if (nextSpan) {
        nextSpan.textContent = textAfter;
        nextSpan.focus();
        const newRange = document.createRange();
        newRange.setStart(nextSpan, 0);
        newRange.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
      }
      scheduleAutoSave();
      return;
    }

    // Backspace on empty todo item exits todo mode
    if (todoContainer && e.key === "Backspace") {
      const textSpan = todoContainer.querySelector(".todo-text") as HTMLElement | null;
      const currentFullText = textSpan?.textContent || "";
      if (currentFullText.trim().length === 0) {
        e.preventDefault();
        const p = document.createElement("p");
        p.innerHTML = "<br>";
        todoContainer.replaceWith(p);
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(p, 0);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        scheduleAutoSave();
        return;
      }
    }
  };

  // Handle Clicking Elements (Images and Checkboxes) inside the note
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // 1. If an image was clicked
    if (target.tagName === "IMG") {
      const img = target as HTMLImageElement;
      let wrapper = img.closest(".onenote-image-wrapper") as HTMLElement | null;
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "onenote-image-wrapper my-3 inline-block max-w-full";
        wrapper.style.width = img.style.width || "100%";
        img.parentNode?.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }

      editorRef.current?.querySelectorAll(".onenote-image-wrapper.selected").forEach((w) => {
        w.classList.remove("selected");
      });
      wrapper.classList.add("selected");

      selectedImageElRef.current = img;
      selectedImageWrapperRef.current = wrapper;
      const currentWidth = wrapper.style.width || "100%";
      setSelectedImageWidth(currentWidth);
      return;
    } else {
      // Clicked outside an image
      if (selectedImageWidth !== null) {
        editorRef.current?.querySelectorAll(".onenote-image-wrapper.selected").forEach((w) => {
          w.classList.remove("selected");
        });
        selectedImageElRef.current = null;
        selectedImageWrapperRef.current = null;
        setSelectedImageWidth(null);
      }
    }

    // 2. If an interactive checkbox inside a todo row is clicked
    if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "checkbox") {
      const checkbox = target as HTMLInputElement;
      const todoContainer = checkbox.closest(".onenote-todo-item");
      const textSpan = todoContainer?.querySelector(".todo-text") as HTMLElement | null;

      if (checkbox.checked) {
        checkbox.setAttribute("checked", "true");
        if (textSpan) {
          textSpan.classList.add("line-through", "text-text-muted");
        }
      } else {
        checkbox.removeAttribute("checked");
        if (textSpan) {
          textSpan.classList.remove("line-through", "text-text-muted");
        }
      }

      scheduleAutoSave();
    }
  };

  // Image Resizing and Formatting Helpers
  const handleResizeImage = (widthStr: string) => {
    const wrapper = selectedImageWrapperRef.current;
    const el = selectedImageElRef.current;
    if (!wrapper || !el) return;
    wrapper.style.width = widthStr;
    el.style.width = "100%";
    el.style.height = "auto";
    setSelectedImageWidth(widthStr);
    scheduleAutoSave();
  };

  const handleAlignImage = (align: "left" | "center" | "right") => {
    const wrapper = selectedImageWrapperRef.current;
    if (!wrapper) return;
    wrapper.style.display = "block";
    if (align === "left") {
      wrapper.style.marginLeft = "0";
      wrapper.style.marginRight = "auto";
    } else if (align === "center") {
      wrapper.style.marginLeft = "auto";
      wrapper.style.marginRight = "auto";
    } else if (align === "right") {
      wrapper.style.marginLeft = "auto";
      wrapper.style.marginRight = "0";
    }
    scheduleAutoSave();
  };

  const handleDeleteImage = () => {
    const wrapper = selectedImageWrapperRef.current;
    if (!wrapper) return;
    wrapper.remove();
    selectedImageElRef.current = null;
    selectedImageWrapperRef.current = null;
    setSelectedImageWidth(null);
    scheduleAutoSave();
    toast("Image removed", "info");
  };

  // Handle Upload Image Button click
  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Please select an image file", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      insertImageToEditor(dataUrl, file.name);
      toast("Image added to page", "success");
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <PageHeader
        title="Notes"
        description="OneNote-style personal notes, checklists, and rich pages."
        actions={
          <div className="flex items-center gap-2">
            {hasFamilyNotes && (
              <Link
                href="/family/notes"
                className="btn btn-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
              >
                <Users className="h-3.5 w-3.5" />
                Family Notes
              </Link>
            )}
            <Button size="sm" onClick={handleCreatePage}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Page
            </Button>
          </div>
        }
      />

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

              {/* OneNote Formatting Toolbar (Bold, Italic, Headings, Lists, To-Do, Images) */}
              <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-b border-border-subtle bg-surface-muted/40 text-text-secondary select-none">
                <button
                  type="button"
                  onClick={() => executeCommand("bold")}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Bold (Ctrl+B)"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("italic")}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Italic (Ctrl+I)"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("underline")}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Underline (Ctrl+U)"
                >
                  <Underline className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("strikeThrough")}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Strikethrough"
                >
                  <Strikethrough className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("hiliteColor", "#fef08a")}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors text-amber-500"
                  title="Highlight (Yellow marker)"
                >
                  <Highlighter className="h-4 w-4" />
                </button>

                <span className="h-4 w-px bg-border-subtle mx-1" />

                <button
                  type="button"
                  onClick={() => executeCommand("formatBlock", "<h1>")}
                  className="px-2 py-1 text-xs font-bold rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Heading 1"
                >
                  H1
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("formatBlock", "<h2>")}
                  className="px-2 py-1 text-xs font-bold rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Heading 2"
                >
                  H2
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("formatBlock", "<p>")}
                  className="px-2 py-1 text-xs font-medium rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Paragraph / Body text"
                >
                  Normal
                </button>

                <span className="h-4 w-px bg-border-subtle mx-1" />

                <button
                  type="button"
                  onClick={() => executeCommand("insertUnorderedList")}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Bulleted list"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("insertOrderedList")}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Numbered list"
                >
                  <ListOrdered className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand("formatBlock", "<blockquote>")}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors"
                  title="Quote block"
                >
                  <Quote className="h-4 w-4" />
                </button>

                <span className="h-4 w-px bg-border-subtle mx-1" />

                {/* To-Do Checkbox Button */}
                <button
                  type="button"
                  onClick={handleInsertTodo}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-brand/10 text-brand hover:bg-brand/20 transition-colors shadow-2xs"
                  title="Insert interactive To-Do checkbox on a new line"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  To-Do
                </button>

                {/* Insert Image Button */}
                <button
                  type="button"
                  onClick={handleImageUploadClick}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border border-border-subtle bg-surface text-text-primary hover:bg-surface-muted transition-colors shadow-2xs"
                  title="Insert or paste an image"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                  Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={handleInsertDivider}
                  className="p-1.5 rounded hover:bg-surface hover:text-text-primary transition-colors ml-auto"
                  title="Insert dividing line"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>

              {/* OneNote Floating Image Format & Resize Bar */}
              {selectedImageWidth !== null && (
                <div className="mx-6 sm:mx-8 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-subtle/50 px-3 py-2 text-xs text-text-primary shadow-xs animate-fade-in">
                  <span className="font-semibold text-brand flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4" />
                    Resize Image:
                  </span>

                  <span className="h-4 w-px bg-border-subtle mx-1" />

                  <span className="text-text-muted">Preset:</span>
                  <button
                    type="button"
                    onClick={() => handleResizeImage("25%")}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                      selectedImageWidth === "25%"
                        ? "bg-brand text-white border-brand shadow-xs"
                        : "bg-surface border-border-subtle hover:bg-surface-muted text-text-primary",
                    )}
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResizeImage("50%")}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                      selectedImageWidth === "50%"
                        ? "bg-brand text-white border-brand shadow-xs"
                        : "bg-surface border-border-subtle hover:bg-surface-muted text-text-primary",
                    )}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResizeImage("75%")}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                      selectedImageWidth === "75%"
                        ? "bg-brand text-white border-brand shadow-xs"
                        : "bg-surface border-border-subtle hover:bg-surface-muted text-text-primary",
                    )}
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResizeImage("100%")}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                      selectedImageWidth === "100%"
                        ? "bg-brand text-white border-brand shadow-xs"
                        : "bg-surface border-border-subtle hover:bg-surface-muted text-text-primary",
                    )}
                  >
                    100%
                  </button>

                  <span className="h-4 w-px bg-border-subtle mx-1" />

                  <span className="text-text-muted">Align:</span>
                  <button
                    type="button"
                    onClick={() => handleAlignImage("left")}
                    className="p-1 rounded bg-surface border border-border-subtle hover:bg-surface-muted text-text-primary"
                    title="Align Left"
                  >
                    <AlignLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignImage("center")}
                    className="p-1 rounded bg-surface border border-border-subtle hover:bg-surface-muted text-text-primary"
                    title="Align Center"
                  >
                    <AlignCenter className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignImage("right")}
                    className="p-1 rounded bg-surface border border-border-subtle hover:bg-surface-muted text-text-primary"
                    title="Align Right"
                  >
                    <AlignRight className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteImage}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-xs text-danger hover:bg-danger-subtle rounded transition-colors"
                    title="Delete image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              )}

              {/* The OneNote Page Canvas Body */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onKeyDown={handleEditorKeyDown}
                onPaste={handleEditorPaste}
                onDrop={handleEditorDrop}
                onClick={handleEditorClick}
                className="onenote-editor flex-1 overflow-y-auto p-6 sm:p-8 outline-none focus:outline-none max-w-none text-text-primary text-sm leading-relaxed"
                style={{
                  minHeight: "400px",
                }}
              />
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

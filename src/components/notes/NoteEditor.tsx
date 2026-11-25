"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import type { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Code,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Link2,
  Image as ImageIcon,
  Table,
  Minus,
  Undo2,
  Redo2,
  PenLine,
  FileCode2,
  Eye,
} from "lucide-react";
import { NOTE_CONTENT_EXTENSIONS } from "@/lib/note-markdown";
import { NoteMarkdown } from "@/components/notes/NoteMarkdown";
import { cn } from "@/lib/utils";

type NoteEditorMode = "rich" | "markdown" | "preview";

interface NoteEditorProps {
  content: string;
  onChange: (markdown: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function insertImageIntoView(view: EditorView, src: string, alt = ""): boolean {
  const imageType = view.state.schema.nodes.image;
  if (!imageType) return false;
  const node = imageType.create({ src, alt });
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  return true;
}

function imageFileFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

function handleEditorPasteImage(view: EditorView, event: ClipboardEvent): boolean {
  const file = imageFileFromClipboard(event);
  if (!file) return false;
  event.preventDefault();
  void readFileAsDataUrl(file).then((src) =>
    insertImageIntoView(view, src, file.name || "Pasted image"),
  );
  return true;
}

function handleEditorDropImage(
  view: EditorView,
  event: DragEvent,
  _slice: Slice,
  moved: boolean,
): boolean {
  if (moved) return false;
  const file = event.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith("image/")) return false;
  event.preventDefault();
  void readFileAsDataUrl(file).then((src) => insertImageIntoView(view, src, file.name));
  return true;
}

const MD_BUTTON_CLASS =
  "px-2 py-1 text-xs font-medium rounded hover:bg-surface-muted text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap";

const RICH_BUTTON_CLASS =
  "p-1.5 rounded hover:bg-surface-muted hover:text-text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none";

const MODE_TABS: { id: NoteEditorMode; label: string; icon: typeof PenLine }[] = [
  { id: "rich", label: "Rich text", icon: PenLine },
  { id: "markdown", label: "Markdown", icon: FileCode2 },
  { id: "preview", label: "Preview", icon: Eye },
];

export function NoteEditor({ content, onChange }: NoteEditorProps) {
  const [mode, setMode] = useState<NoteEditorMode>("rich");
  const [mdDraft, setMdDraft] = useState(content);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const mdDraftRef = useRef(content);
  const lastEmittedRef = useRef<string | null>(null);
  const editorMdRef = useRef("");
  const mdAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const updateMdDraft = useCallback((md: string) => {
    mdDraftRef.current = md;
    setMdDraft(md);
  }, []);

  const emitMarkdown = useCallback(
    (md: string) => {
      lastEmittedRef.current = md;
      updateMdDraft(md);
      onChangeRef.current(md);
    },
    [updateMdDraft],
  );

  const editor = useEditor(
    {
      extensions: [
        ...NOTE_CONTENT_EXTENSIONS,
        Markdown,
        Placeholder.configure({
          placeholder: "Start writing… supports markdown, lists, tasks, images and more.",
        }),
      ],
      content: "",
      contentType: "markdown",
      immediatelyRender: false,
      onUpdate: ({ editor: ed }) => {
        const md = ed.getMarkdown();
        lastEmittedRef.current = md;
        editorMdRef.current = md;
        updateMdDraft(md);
        onChangeRef.current(md);
      },
      editorProps: {
        attributes: { class: "prose note-tiptap-body" },
        handlePaste: handleEditorPasteImage,
        handleDrop: handleEditorDropImage,
      },
    },
    [],
  );

  // Load externally supplied markdown (note switch / initial content)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (content === lastEmittedRef.current) return;
    lastEmittedRef.current = null;
    editorMdRef.current = content;
    updateMdDraft(content);
    editor.commands.setContent(content, { contentType: "markdown" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor]);

  const showMarkdownMode = useCallback(() => {
    if (editor && !editor.isDestroyed) {
      const md = editor.getMarkdown();
      if (md !== mdDraftRef.current) {
        emitMarkdown(md);
      }
    }
    setMode("markdown");
  }, [editor, emitMarkdown]);

  const showRichMode = useCallback(() => {
    if (editor && !editor.isDestroyed && editorMdRef.current !== mdDraftRef.current) {
      editorMdRef.current = mdDraftRef.current;
      editor.commands.setContent(mdDraftRef.current, { contentType: "markdown" });
    }
    setMode("rich");
  }, [editor]);

  const selectMode = useCallback(
    (next: NoteEditorMode) => {
      if (next === mode) return;
      if (next === "markdown") showMarkdownMode();
      else if (next === "rich") showRichMode();
      else setMode("preview");
    },
    [mode, showMarkdownMode, showRichMode],
  );

  // ---------- Markdown source editing helpers ----------

  const setMarkdownValue = useCallback(
    (value: string, caret?: number) => {
      lastEmittedRef.current = value;
      updateMdDraft(value);
      onChangeRef.current(value);
      if (caret !== undefined) {
        requestAnimationFrame(() => {
          const el = mdAreaRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(caret, caret);
          }
        });
      }
    },
    [updateMdDraft],
  );

  const applyInlineMarkdown = useCallback(
    (before: string, after: string, placeholder = "text") => {
      const el = mdAreaRef.current;
      if (!el) return;
      const { selectionStart: s, selectionEnd: e, value } = el;
      const selected = value.slice(s, e) || placeholder;
      const next = value.slice(0, s) + before + selected + after + value.slice(e);
      setMarkdownValue(next, s + before.length + selected.length + after.length);
    },
    [setMarkdownValue],
  );

  const insertMarkdownAtCursor = useCallback(
    (snippet: string) => {
      const el = mdAreaRef.current;
      if (!el) return;
      const { selectionStart: s, selectionEnd: e, value } = el;
      const next = value.slice(0, s) + snippet + value.slice(e);
      setMarkdownValue(next, s + snippet.length);
    },
    [setMarkdownValue],
  );

  const toggleLinePrefix = useCallback(
    (prefix: string) => {
      const el = mdAreaRef.current;
      if (!el) return;
      const { selectionStart: s, selectionEnd: e, value } = el;
      const blockStart = value.lastIndexOf("\n", s - 1) + 1;
      const nextBreak = value.indexOf("\n", e);
      const blockEnd = nextBreak === -1 ? value.length : nextBreak;
      const lines = value.slice(blockStart, blockEnd).split("\n");
      const remove = lines.every((l) => l.startsWith(prefix) || l.trim() === "");
      const nextLines = lines.map((l) =>
        remove ? (l.startsWith(prefix) ? l.slice(prefix.length) : l) : prefix + l,
      );
      const next = value.slice(0, blockStart) + nextLines.join("\n") + value.slice(blockEnd);
      const delta = remove ? -prefix.length : prefix.length;
      setMarkdownValue(next, Math.max(blockStart, s + delta));
    },
    [setMarkdownValue],
  );

  const handleMarkdownKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(e.ctrlKey || e.metaKey)) {
        if (e.key === "Tab") {
          e.preventDefault();
          insertMarkdownAtCursor("  ");
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        applyInlineMarkdown("**", "**");
      } else if (key === "i") {
        e.preventDefault();
        applyInlineMarkdown("*", "*");
      } else if (key === "k") {
        e.preventDefault();
        applyInlineMarkdown("[", "](https://)", "link text");
      }
    },
    [applyInlineMarkdown, insertMarkdownAtCursor],
  );

  // ---------- Rich text helpers ----------

  const handleInsertImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const src = await readFileAsDataUrl(file);
      if (editor && !editor.isDestroyed) {
        editor
          .chain()
          .focus()
          .setImage({ src, alt: file.name || "image" })
          .run();
      }
    },
    [editor],
  );

  const handleImageInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleInsertImageFile(file);
      if (imageInputRef.current) imageInputRef.current.value = "";
    },
    [handleInsertImageFile],
  );

  const handleInsertLink = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Enter link URL", "https://");
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const applyBlockType = useCallback(
    (value: string) => {
      if (!editor || editor.isDestroyed) return;
      const chain = editor.chain().focus();
      if (value === "h1") chain.toggleHeading({ level: 1 }).run();
      else if (value === "h2") chain.toggleHeading({ level: 2 }).run();
      else if (value === "h3") chain.toggleHeading({ level: 3 }).run();
      else if (value === "quote") chain.toggleBlockquote().run();
      else if (value === "code") chain.toggleCodeBlock().run();
      else chain.setParagraph().run();
    },
    [editor],
  );

  const currentBlockType = (() => {
    if (!editor) return "p";
    if (editor.isActive("heading", { level: 1 })) return "h1";
    if (editor.isActive("heading", { level: 2 })) return "h2";
    if (editor.isActive("heading", { level: 3 })) return "h3";
    if (editor.isActive("blockquote")) return "quote";
    if (editor.isActive("codeBlock")) return "code";
    return "p";
  })();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 px-4 pt-2.5 border-b border-border-subtle bg-surface-muted/40">
        {MODE_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectMode(id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-colors -mb-px",
              mode === id
                ? "border-brand text-brand bg-surface"
                : "border-transparent text-text-muted hover:text-text-primary",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Contextual toolbar */}
      {mode === "rich" && editor && (
        <div className="flex flex-wrap items-center gap-0.5 px-4 py-2 border-b border-border-subtle bg-surface-muted/40 text-text-secondary select-none">
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            onClick={() => editor.chain().focus().undo().run()}
            className={RICH_BUTTON_CLASS}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Y)"
            onClick={() => editor.chain().focus().redo().run()}
            className={RICH_BUTTON_CLASS}
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <span className="h-4 w-px bg-border-subtle mx-1.5" />
          <button
            type="button"
            title="Bold (Ctrl+B)"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("bold") && "bg-surface-muted text-brand",
            )}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Italic (Ctrl+I)"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("italic") && "bg-surface-muted text-brand",
            )}
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Underline (Ctrl+U)"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("underline") && "bg-surface-muted text-brand",
            )}
          >
            <Underline className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Strikethrough"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("strike") && "bg-surface-muted text-brand",
            )}
          >
            <Strikethrough className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Highlight"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("highlight") && "bg-surface-muted text-brand",
            )}
          >
            <Highlighter className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Inline code"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("code") && "bg-surface-muted text-brand",
            )}
          >
            <Code className="h-4 w-4" />
          </button>
          <span className="h-4 w-px bg-border-subtle mx-1.5" />
          <select
            value={currentBlockType}
            onChange={(e) => applyBlockType(e.target.value)}
            className="h-7 px-1.5 text-xs rounded border border-border-subtle bg-surface text-text-secondary focus:outline-none focus:border-brand"
            title="Text style"
          >
            <option value="p">Normal</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="quote">Quote</option>
            <option value="code">Code block</option>
          </select>
          <span className="h-4 w-px bg-border-subtle mx-1.5" />
          <button
            type="button"
            title="Bulleted list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("bulletList") && "bg-surface-muted text-brand",
            )}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Numbered list"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("orderedList") && "bg-surface-muted text-brand",
            )}
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="To-do list"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("taskList") && "bg-surface-muted text-brand",
            )}
          >
            <ListTodo className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Quote"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("blockquote") && "bg-surface-muted text-brand",
            )}
          >
            <Quote className="h-4 w-4" />
          </button>
          <span className="h-4 w-px bg-border-subtle mx-1.5" />
          <button
            type="button"
            title="Link"
            onClick={handleInsertLink}
            className={cn(
              RICH_BUTTON_CLASS,
              editor.isActive("link") && "bg-surface-muted text-brand",
            )}
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Image"
            onClick={() => imageInputRef.current?.click()}
            className={RICH_BUTTON_CLASS}
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Insert table"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            className={RICH_BUTTON_CLASS}
          >
            <Table className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Divider"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className={RICH_BUTTON_CLASS}
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageInputChange}
            className="hidden"
          />
        </div>
      )}

      {mode === "markdown" && (
        <div className="flex flex-wrap items-center gap-0.5 px-4 py-2 border-b border-border-subtle bg-surface-muted/40 select-none">
          <button
            type="button"
            title="Bold — **text** (Ctrl+B)"
            onClick={() => applyInlineMarkdown("**", "**")}
            className={MD_BUTTON_CLASS}
          >
            B
          </button>
          <button
            type="button"
            title="Italic — *text* (Ctrl+I)"
            onClick={() => applyInlineMarkdown("*", "*")}
            className={MD_BUTTON_CLASS}
          >
            I
          </button>
          <button
            type="button"
            title="Strikethrough — ~~text~~"
            onClick={() => applyInlineMarkdown("~~", "~~")}
            className={MD_BUTTON_CLASS}
          >
            S
          </button>
          <button
            type="button"
            title="Inline code"
            onClick={() => applyInlineMarkdown("`", "`", "code")}
            className={MD_BUTTON_CLASS}
          >
            `code`
          </button>
          <span className="h-4 w-px bg-border-subtle mx-1.5" />
          <button
            type="button"
            title="Heading 1"
            onClick={() => toggleLinePrefix("# ")}
            className={MD_BUTTON_CLASS}
          >
            H1
          </button>
          <button
            type="button"
            title="Heading 2"
            onClick={() => toggleLinePrefix("## ")}
            className={MD_BUTTON_CLASS}
          >
            H2
          </button>
          <button
            type="button"
            title="Heading 3"
            onClick={() => toggleLinePrefix("### ")}
            className={MD_BUTTON_CLASS}
          >
            H3
          </button>
          <span className="h-4 w-px bg-border-subtle mx-1.5" />
          <button
            type="button"
            title="Bulleted list — - "
            onClick={() => toggleLinePrefix("- ")}
            className={MD_BUTTON_CLASS}
          >
            • List
          </button>
          <button
            type="button"
            title="Numbered list — 1. "
            onClick={() => toggleLinePrefix("1. ")}
            className={MD_BUTTON_CLASS}
          >
            1. List
          </button>
          <button
            type="button"
            title="Task list — - [ ] "
            onClick={() => toggleLinePrefix("- [ ] ")}
            className={MD_BUTTON_CLASS}
          >
            - [ ] Task
          </button>
          <button
            type="button"
            title="Quote — > "
            onClick={() => toggleLinePrefix("> ")}
            className={MD_BUTTON_CLASS}
          >
            {">"} Quote
          </button>
          <span className="h-4 w-px bg-border-subtle mx-1.5" />
          <button
            type="button"
            title="Code block"
            onClick={() => insertMarkdownAtCursor("```\ncode\n```\n")}
            className={MD_BUTTON_CLASS}
          >
            {"</>"}
          </button>
          <button
            type="button"
            title="Link — [text](url) (Ctrl+K)"
            onClick={() => applyInlineMarkdown("[", "](https://)", "link text")}
            className={MD_BUTTON_CLASS}
          >
            Link
          </button>
          <button
            type="button"
            title="Image — ![alt](url)"
            onClick={() => insertMarkdownAtCursor("![alt](https://)\n")}
            className={MD_BUTTON_CLASS}
          >
            Image
          </button>
          <button
            type="button"
            title="Table"
            onClick={() =>
              insertMarkdownAtCursor(
                "\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n",
              )
            }
            className={MD_BUTTON_CLASS}
          >
            Table
          </button>
          <button
            type="button"
            title="Horizontal rule"
            onClick={() => insertMarkdownAtCursor("\n\n---\n\n")}
            className={MD_BUTTON_CLASS}
          >
            —
          </button>
        </div>
      )}

      {/* Editor surface */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {mode === "rich" &&
          (editor ? (
            <EditorContent editor={editor} className="note-editor px-6 py-6 sm:px-8" />
          ) : (
            <div className="px-6 py-6 sm:px-8 text-sm text-text-muted">Loading editor…</div>
          ))}

        {mode === "markdown" && (
          <textarea
            ref={mdAreaRef}
            value={mdDraft}
            onChange={(e) => {
              const v = e.target.value;
              lastEmittedRef.current = v;
              updateMdDraft(v);
              onChangeRef.current(v);
            }}
            onKeyDown={handleMarkdownKeyDown}
            spellCheck={false}
            placeholder="Write markdown…"
            className="w-full h-full min-h-[400px] resize-none bg-transparent px-6 py-6 sm:px-8 font-mono text-[13px] leading-relaxed text-text-primary outline-none placeholder:text-text-muted/60"
          />
        )}

        {mode === "preview" && (
          <div className="px-6 py-6 sm:px-8 min-h-[400px]">
            {mdDraft.trim() ? (
              <NoteMarkdown content={mdDraft} className="text-sm" />
            ) : (
              <p className="text-sm text-text-muted italic">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { Blade } from "@/components/ui/Blade";
import { Button } from "@/components/ui/Button";
import {
  Sparkles,
  Send,
  Bot,
  Copy,
  Check,
  RotateCcw,
  MessageSquare,
  Loader2,
  Folder,
  Maximize2,
  Minimize2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

const QUICK_PROMPTS = [
  "Summarize the key points",
  "Are there any expiry or due dates?",
  "Who are the parties or institutions involved?",
  "List any fees, amounts, or account numbers",
];

export function DocumentQA({
  documentId,
  documentName,
  folderId,
  folderName,
  isOpen,
  onClose,
}: {
  documentId?: string;
  documentName?: string;
  folderId?: string;
  folderName?: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFolder = Boolean(folderId);
  const title = isFolder ? "Ask AI about Folder" : "Ask AI about Document";
  const subtitle = isFolder ? folderName : documentName;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const handleSend = async (messageText?: string) => {
    const textToSend = (messageText || inputValue).trim();
    if (!textToSend || loading) return;

    setError(null);
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: textToSend,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          message: textToSend,
          sessionId: sessionId || undefined,
          documentId: documentId || undefined,
          folderId: folderId || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to get AI response.");
      }

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response || "No response received.",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const handleClear = () => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  };

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title={title}
      description={subtitle}
      icon={
        isFolder ? (
          <Folder className="h-5 w-5 text-brand" />
        ) : (
          <Sparkles className="h-5 w-5 text-brand" />
        )
      }
      size={isMaximized ? "full" : "xl"}
      headerActions={
        <button
          type="button"
          onClick={() => setIsMaximized((prev) => !prev)}
          aria-label={isMaximized ? "Restore standard size" : "Maximize blade"}
          className="rounded p-2 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary"
          title={isMaximized ? "Restore standard width" : "Maximize blade full screen"}
        >
          {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      }
      bodyClassName="p-0 flex flex-col h-full overflow-hidden"
      subheader={
        messages.length > 0 ? (
          <div className="flex items-center justify-between border-t border-border-subtle py-2 px-5 sm:px-6 text-xs text-text-muted bg-surface-muted/30">
            <span>{messages.length} messages in conversation</span>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Clear chat
            </button>
          </div>
        ) : null
      }
      footer={
        <div className="w-full">
          {error && (
            <div className="mb-2.5 rounded-xl border border-danger/20 bg-danger-subtle p-2.5 text-xs text-danger">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                isFolder ? "Ask about folder documents..." : "Ask a question about this document..."
              }
              disabled={loading}
              className="flex-1 bg-surface border border-border-subtle rounded-xl px-4 py-2.5 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
            />
            <Button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="h-10 px-4 rounded-xl shrink-0 gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-medium">Send</span>
            </Button>
          </form>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[380px] text-center space-y-5 px-4 py-8">
            <div className="p-4 rounded-2xl bg-brand/10 text-brand shadow-sm">
              {isFolder ? (
                <Folder className="w-10 h-10" />
              ) : (
                <MessageSquare className="w-10 h-10" />
              )}
            </div>
            <div className="max-w-lg">
              <p className="font-semibold text-text-primary text-base sm:text-lg">
                {isFolder ? "Ask questions across this folder" : "Ask anything about this document"}
              </p>
              <p className="text-xs sm:text-sm text-text-muted mt-1.5 leading-relaxed">
                {isFolder
                  ? "Gemini will cross-reference all documents in this folder to summarize, extract facts, and answer questions."
                  : "Gemini analyzes the full extracted text and summary to give you grounded, instant answers."}
              </p>
            </div>
            <div className="w-full max-w-xl pt-2">
              <span className="block text-[11px] font-semibold text-text-muted text-left uppercase tracking-wider mb-2.5">
                Suggested prompts
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {QUICK_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(prompt)}
                    className="text-left px-3.5 py-2.5 rounded-xl border border-border-subtle bg-surface-muted/50 hover:bg-surface-muted text-xs text-text-secondary hover:text-text-primary transition-all flex items-center justify-between group"
                  >
                    <span className="line-clamp-2 pr-1">{prompt}</span>
                    <Send className="w-3.5 h-3.5 text-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4.5 w-4.5" />
                </div>
              )}
              <div
                className={`group relative rounded-2xl px-4.5 py-3 max-w-[85%] text-xs sm:text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand text-white rounded-br-sm shadow-sm"
                    : "bg-surface-muted border border-border-subtle text-text-primary rounded-bl-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-xs sm:prose-sm dark:prose-invert max-w-none text-xs sm:text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}

                {msg.role === "assistant" && (
                  <button
                    onClick={() => copyToClipboard(msg.content, msg.id)}
                    className="absolute bottom-2 right-2 p-1 rounded-md bg-surface border border-border-subtle text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    title="Copy response"
                    aria-label="Copy response"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="h-8 w-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
              <Bot className="h-4.5 w-4.5" />
            </div>
            <div className="bg-surface-muted border border-border-subtle rounded-2xl rounded-bl-sm px-4 py-3 text-xs sm:text-sm text-text-muted flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              <span>Thinking & extracting answers…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </Blade>
  );
}

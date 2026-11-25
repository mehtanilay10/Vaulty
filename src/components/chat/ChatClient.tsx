"use client";

import { useState, useEffect, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Send,
  Sparkles,
  FileText,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Mic,
  MicOff,
  AlertTriangle,
  X,
  History,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useRouter } from "next/navigation";

const MermaidChart = dynamic(
  () => import("@/components/ui/MermaidChart").then((m) => m.MermaidChart),
  {
    loading: () => (
      <div className="flex justify-center py-2 text-xs text-text-muted">Loading chart...</div>
    ),
    ssr: false,
  },
);

function CustomMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm text-text-primary prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }: React.ComponentPropsWithoutRef<"code">) {
            const match = /language-(\w+)/.exec(className || "");
            if (match && match[1] === "mermaid") {
              return <MermaidChart chart={String(children).replace(/\n$/, "")} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function ChatClient({
  sessions = [],
}: {
  sessions?: { id: string; title: string; updatedAt: string }[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<
    {
      id?: string;
      role: string;
      content: string;
      referencedDocs?: { id: string; name: string }[];
    }[]
  >([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micSupported] = useState(() => {
    if (typeof window === "undefined") return true;
    const w = window as unknown as {
      webkitSpeechRecognition?: unknown;
      SpeechRecognition?: unknown;
    };
    return !!(w.webkitSpeechRecognition || w.SpeechRecognition);
  });
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const initialSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (sessions.length > 0 && !sessionId && !initialSessionIdRef.current) {
      initialSessionIdRef.current = sessions[0].id;
      setSessionId(sessions[0].id);
      loadMessages(sessions[0].id, controller.signal);
    }
    return () => {
      controller.abort();
    };
  }, [sessions, sessionId]);

  useEffect(() => {
    if (messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  async function loadMessages(sid: string, signal?: AbortSignal) {
    try {
      const res = await fetch(`/api/chat/${sid}/messages`, { signal });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Failed to load messages for this conversation.");
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      console.error("Failed to load messages:", err);
      setError("Failed to load messages. Please try again.");
    }
  }

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 300) + "px";
  };

  const startListening = async () => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => unknown;
          SpeechRecognition?: new () => unknown;
        }
      ).webkitSpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => unknown;
          SpeechRecognition?: new () => unknown;
        }
      ).SpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setError(
        "Microphone permission denied. Please allow microphone access in your browser settings and reload the page.",
      );
      return;
    }

    const recognition = new (SpeechRecognition as new () => unknown)() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((event: unknown) => void) | null;
      onerror: ((event: unknown) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: unknown) => {
      const e = event as { results: { [key: number]: { [key: number]: { transcript: string } } } };
      const transcript = e.results[0][0].transcript;
      setInput((prev) => prev + (prev ? " " : "") + transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: unknown) => {
      const e = event as { error: string };
      if (e.error === "not-allowed") {
        setError("Microphone access was denied. Please allow microphone permission and try again.");
      } else if (e.error === "no-speech") {
        setError("No speech detected. Please try again.");
      } else {
        setError(`Voice input error: ${e.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    setError(null);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSend = () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);

    const userMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    fetch("/api/chat", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: userMessage.content, sessionId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send message.");

        if (!sessionId && data.sessionId) {
          setSessionId(data.sessionId);
          loadMessages(data.sessionId);
          router.refresh();
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            referencedDocs: data.referencedDocs,
          },
        ]);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to send message.";
        setError(message);
        setMessages((prev) => prev.slice(0, -1));
      })
      .finally(() => {
        setLoading(false);
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([]);
  };

  const handleSessionClick = (sid: string) => {
    setSessionId(sid);
    loadMessages(sid);
  };

  const isMicDisabled = loading || !micSupported;

  const suggestions = [
    "Summarise my medical documents",
    "Which documents expire soon?",
    "What did I upload last month?",
  ];

  return (
    <>
      <div className="flex h-[calc(100dvh-12.5rem)] md:h-[calc(100dvh-7rem)] flex-col overflow-hidden">
        <div className="shrink-0 mb-3">
          <PageHeader
            title="AI Chat"
            icon={<MessageSquare className="h-5 w-5" />}
            actions={
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={handleNewChat} className="sm:hidden">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">New</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMobileDrawerOpen(true)}
                  className="sm:hidden"
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleNewChat}
                  className="hidden sm:flex"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New chat
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="hidden md:flex"
                  title={sidebarOpen ? "Hide history" : "Show history"}
                  aria-label={sidebarOpen ? "Hide history" : "Show history"}
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  ) : (
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            }
          />
        </div>

        <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
          {sidebarOpen && (
            <div className="hidden w-60 shrink-0 md:block h-full">
              <Card className="flex h-full flex-col p-3 overflow-hidden">
                <Button onClick={handleNewChat} className="mb-3 w-full shrink-0">
                  <Plus className="h-4 w-4" />
                  New chat
                </Button>
                <div className="mb-1 flex items-center justify-between px-1 shrink-0">
                  <p className="section-eyebrow">Chat history</p>
                  <span className="text-[10px] font-semibold text-text-muted">
                    {sessions.length}
                  </span>
                </div>
                <div className="flex-1 min-h-0 space-y-0.5 overflow-y-auto">
                  {sessions.length === 0 && (
                    <p className="py-4 text-center text-[11px] text-text-muted">No chats yet</p>
                  )}
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSessionClick(s.id)}
                      className={`w-full truncate rounded px-2.5 py-2 text-left text-[12px] transition-colors ${
                        sessionId === s.id
                          ? "bg-brand-subtle font-semibold text-brand"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                      }`}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0">
            {error && (
              <Alert variant="danger" className="mb-3 shrink-0">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </Alert>
            )}

            <Card className="flex-1 min-h-0 flex flex-col overflow-hidden p-0">
              <div
                ref={messagesContainerRef}
                className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
              >
                {messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-brand/15 bg-brand-subtle text-brand shadow-fluent-2">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h3 className="mb-1.5 text-[17px] font-semibold text-text-primary">
                      Ask anything about your vault
                    </h3>
                    <p className="max-w-sm text-[13px] leading-relaxed text-text-muted">
                      I can search through your documents, summaries, and extracted text, then
                      answer with citations back to the source files.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setInput(suggestion);
                            textareaRef.current?.focus();
                          }}
                          className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-brand/40 hover:bg-brand-subtle hover:text-brand"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id || `msg-${msg.role}-${msg.content.slice(0, 20)}`}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 ${
                        msg.role === "user"
                          ? "rounded-br-sm bg-brand text-white shadow-fluent-2"
                          : "rounded-bl-sm border border-border-subtle bg-surface-muted"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className={`text-sm whitespace-pre-wrap text-white`}>{msg.content}</p>
                      ) : (
                        <CustomMarkdown content={msg.content} />
                      )}
                      {msg.role === "assistant" &&
                        msg.referencedDocs &&
                        msg.referencedDocs.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-border-subtle/50">
                            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                              Sources
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.referencedDocs.map((doc: { id: string; name: string }) => (
                                <Link
                                  key={doc.id}
                                  href={`/documents/${doc.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface border border-border-subtle text-text-secondary text-[11px] hover:text-brand hover:border-brand/50 transition-colors"
                                >
                                  <FileText className="w-3 h-3" />
                                  {doc.name}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-surface-muted border border-border-subtle rounded-lg p-4">
                      <LoadingSpinner className="w-4 h-4 text-brand" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-border-subtle bg-surface px-4 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      autoResize();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a question about your documents..."
                    className="input min-h-[44px] flex-1 resize-none px-3 py-2.5 text-sm"
                    rows={2}
                    disabled={loading}
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={isMicDisabled}
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-md font-medium shadow-fluent-2 transition-all",
                        isListening
                          ? "bg-danger text-white"
                          : "bg-brand text-white hover:bg-brand-hover",
                        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand",
                      )}
                      title={
                        !micSupported
                          ? "Voice input not supported in this browser"
                          : isListening
                            ? "Stop listening"
                            : "Voice input"
                      }
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                    <Button
                      onClick={handleSend}
                      disabled={loading || !input.trim()}
                      className="h-9 w-9 px-0"
                      aria-label="Send message"
                    >
                      {loading ? (
                        <LoadingSpinner className="w-4 h-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                {isListening && (
                  <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-danger">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
                    Listening... speak now
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            className="fixed inset-0 bg-background/70 backdrop-blur-md"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 flex w-72 flex-col border-r border-border-subtle bg-surface-elevated shadow-fluent-64">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div>
                <p className="section-eyebrow">Assistant</p>
                <h2 className="text-[14px] font-semibold text-text-primary">Chat history</h2>
              </div>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="rounded p-1.5 text-text-secondary transition-colors hover:bg-surface-muted"
                aria-label="Close chat history"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <Button
                onClick={() => {
                  handleNewChat();
                  setMobileDrawerOpen(false);
                }}
                className="w-full"
              >
                <Plus className="h-4 w-4" />
                New chat
              </Button>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
              {sessions.length === 0 && (
                <p className="py-4 text-center text-[11px] text-text-muted">No chats yet</p>
              )}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    handleSessionClick(s.id);
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full truncate rounded px-2.5 py-2 text-left text-[12px] transition-colors ${
                    sessionId === s.id
                      ? "bg-brand-subtle font-semibold text-brand"
                      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

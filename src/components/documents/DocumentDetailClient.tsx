"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { csrfHeaders } from "@/lib/csrf-client";
import { Tabs, Tab } from "@/components/ui/Tabs";

const DocumentPropertiesModal = dynamic(
  () =>
    import("@/components/documents/DocumentPropertiesModal").then(
      (mod) => mod.DocumentPropertiesModal,
    ),
  { ssr: false },
);
const ShareModal = dynamic(
  () => import("@/components/documents/ShareModal").then((mod) => mod.ShareModal),
  { ssr: false },
);
const DocumentQA = dynamic(
  () => import("@/components/documents/DocumentQA").then((mod) => mod.DocumentQA),
  { ssr: false },
);
const CameraScanModal = dynamic(
  () => import("@/components/documents/CameraScanModal").then((mod) => mod.CameraScanModal),
  { ssr: false },
);
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton, CommandBarDivider } from "@/components/ui/CommandBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  Download,
  Settings,
  Sparkles,
  Eye,
  FileCode,
  AlertTriangle,
  Lock,
  RefreshCw,
  ExternalLink,
  Share2,
  Plus,
  CloudOff,
  Trash2,
  Edit3,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { DocumentWithRelations } from "@/types";

// react-pdf/pdf.js reference browser-only APIs (for example DOMMatrix) at module
// evaluation time, so the viewer must never be imported during server rendering.
const DocumentViewer = dynamic(
  () => import("@/components/ui/DocumentViewer").then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    ),
  },
);

const REQUEST_TIMEOUT_MS = 30_000;

function messageForStatus(status: number, fallback: string): string {
  switch (status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "This document could not be found.";
    case 409:
      return "This document was updated elsewhere. Refresh the page and try again.";
    case 413:
      return "The request is too large.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    default:
      return status >= 500
        ? "The server is unavailable right now. Please try again shortly."
        : fallback;
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data?.error === "string" && data.error) return data.error;
  } catch {
    // Fall through to status-based message when the body is not JSON.
  }
  return messageForStatus(response.status, fallback);
}

function describeFetchError(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The request timed out. Please try again.";
  }
  if (error instanceof TypeError) {
    return "Network error. Check your connection and try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function safeFormatDate(dateStr: string | null | undefined, fallback = ""): string {
  if (!dateStr) return fallback;
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) {
      const fallbackDate = new Date(dateStr);
      return isNaN(fallbackDate.getTime())
        ? fallback || dateStr
        : fallbackDate.toLocaleDateString();
    }
    return d.toLocaleDateString();
  } catch {
    return fallback || dateStr;
  }
}

function safeIsoDate(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return "";
  try {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export function DocumentDetailClient({
  document,
  folders,
  isOwner,
  familyOwner,
}: {
  document: DocumentWithRelations;
  folders: { id: string; name: string; parentId?: string | null }[];
  isOwner: boolean;
  familyOwner?: { id: string; name: string | null; email: string | null } | null;
}) {
  const router = useRouter();
  const { toast, confirmAction } = useFeedback();
  const [activeTab, setActiveTab] = useState<"preview" | "summary" | "interpretation" | "text">(
    "preview",
  );
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isRetryingAi, setIsRetryingAi] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isQaOpen, setIsQaOpen] = useState(false);
  const [isAddPageOpen, setIsAddPageOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const storageLabel = "Google Drive";

  const handleDeleteDocument = async () => {
    const confirmed = await confirmAction({
      title: "Delete document?",
      description: `Delete "${document.name}" permanently? This cannot be undone.`,
      confirmLabel: "Delete document",
      tone: "danger",
    });
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete document.");
      }
      toast("Document deleted successfully.", "info");
      router.push("/documents");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete document.", "error");
      setIsDeleting(false);
    }
  };

  const aiStatus = document.aiProcessing?.status;
  const isAiPending = aiStatus === "QUEUED" || aiStatus === "PROCESSING" || isRetryingAi;

  // Poll for AI completion when status is queued or processing
  useEffect(() => {
    if (!isAiPending) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/documents/${document.id}`, {
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const currentStatus = data.document?.aiProcessing?.status;
        if (currentStatus && currentStatus !== "QUEUED" && currentStatus !== "PROCESSING") {
          clearInterval(interval);
          router.refresh();
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isAiPending, document.id, router]);

  const fileProxyUrl = `/api/documents/${document.id}/file`;
  const extractedMetadata = document.aiProcessing?.extractedMetadata as
    | {
        documentType?: string | null;
        expiryDate?: string | null;
        expiryDateConfidence?: number;
        expiryDateEvidence?: string | null;
        importantDates?: Array<{
          type: string;
          date: string;
          confidence: number;
          evidence?: string | null;
        }>;
      }
    | null
    | undefined;
  const [reviewExpiryDate, setReviewExpiryDate] = useState(() => {
    if (extractedMetadata?.expiryDate) return extractedMetadata.expiryDate;
    return safeIsoDate(document.expiryDate);
  });
  const [reviewImportantDates, setReviewImportantDates] = useState(() => {
    const dates = Array.isArray(extractedMetadata?.importantDates)
      ? extractedMetadata.importantDates
      : [];
    return dates.map((item) => ({ ...item, date: item?.date || "" }));
  });
  const [savingDates, setSavingDates] = useState(false);
  const [dateReviewMessage, setDateReviewMessage] = useState<string | null>(null);
  const saveReviewedDates = async () => {
    setSavingDates(true);
    setDateReviewMessage(null);
    try {
      const response = await fetchWithTimeout(`/api/documents/${document.id}/dates`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          expiryDate: reviewExpiryDate || null,
          importantDates: reviewImportantDates.map((item) => ({
            type: item.type,
            date: item.date || null,
            confidence: item.confidence,
            evidence: item.evidence || null,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Could not save reviewed dates."));
      }
      setDateReviewMessage("Reviewed dates saved and reminders updated.");
      router.refresh();
    } catch (error) {
      setDateReviewMessage(describeFetchError(error, "Could not save reviewed dates."));
    } finally {
      setSavingDates(false);
    }
  };
  const extractedExpiryIsEffective = Boolean(
    extractedMetadata?.expiryDate &&
    document.expiryDate &&
    safeIsoDate(document.expiryDate) === extractedMetadata.expiryDate,
  );

  const refreshData = () => {
    router.refresh();
  };

  const handleRetryAi = async () => {
    setIsRetryingAi(true);
    setAiErrorMessage(null);
    try {
      const response = await fetchWithTimeout(`/api/documents/${document.id}/ai`, {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Could not start AI processing."));
      }
      router.refresh();
    } catch (err) {
      setAiErrorMessage(describeFetchError(err, "Could not start AI processing."));
    } finally {
      setIsRetryingAi(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-3">
          <PageHeader
            breadcrumbs={[
              ...(familyOwner
                ? [
                    { label: "Family", href: "/family" },
                    {
                      label: `${familyOwner.name || familyOwner.email || "Family member"}'s Documents`,
                      href: `/family/${familyOwner.id}/documents`,
                    },
                  ]
                : [
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "Documents", href: "/documents" },
                  ]),
              ...(document.folder
                ? [{ label: document.folder.name, href: `/folders/${document.folder.id}` }]
                : []),
              { label: document.name },
            ]}
            title={document.name}
            truncateTitle
            icon={<FileText className="h-5 w-5" />}
            actions={
              !isOwner ? (
                <Badge variant="info">
                  <Lock className="h-3 w-3" />
                  Shared read only
                </Badge>
              ) : undefined
            }
          />

          <CommandBar>
            <CommandBarButton
              icon={<Download className="h-3.5 w-3.5" />}
              item={{ key: "download", label: "Download", href: fileProxyUrl }}
            />
            {isOwner && (
              <CommandBarButton
                icon={<Share2 className="h-3.5 w-3.5" />}
                onClick={() => setIsShareOpen(true)}
              >
                Share
              </CommandBarButton>
            )}
            <CommandBarButton
              icon={<Sparkles className="h-3.5 w-3.5 text-brand" />}
              onClick={() => setIsQaOpen(true)}
            >
              Ask AI
            </CommandBarButton>
            {isOwner &&
              (document.mimeType === "application/pdf" ||
                document.mimeType.startsWith("image/")) && (
                <CommandBarButton
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setIsAddPageOpen(true)}
                >
                  Add Page
                </CommandBarButton>
              )}
            <CommandBarDivider />
            {document.storageProvider === "GOOGLE_DRIVE" && document.storageWebViewLink && (
              <CommandBarButton
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                item={{ key: "drive", label: "Open in Drive", href: document.storageWebViewLink }}
              />
            )}
            {isOwner && (
              <CommandBarButton
                icon={<Edit3 className="h-3.5 w-3.5" />}
                onClick={() => setIsPropertiesOpen(true)}
              >
                Properties
              </CommandBarButton>
            )}
            {isOwner && (
              <>
                <CommandBarDivider />
                <CommandBarButton
                  danger
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={handleDeleteDocument}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </CommandBarButton>
              </>
            )}
          </CommandBar>
        </div>

        {document.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {document.tags.map((t) => (
              <span
                key={t.tag.id}
                className="rounded border border-border-subtle bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary"
              >
                #{t.tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {(document.aiProcessing || isOwner) && (
        <Card className="p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-warning/25 bg-warning-subtle text-warning">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold text-text-primary">AI processing</p>
                  <Badge
                    variant={
                      document.aiProcessing?.status === "COMPLETED"
                        ? "success"
                        : document.aiProcessing?.status === "FAILED"
                          ? "danger"
                          : document.aiProcessing?.status
                            ? "warning"
                            : "default"
                    }
                  >
                    {(document.aiProcessing?.status || "NOT_REQUESTED").replace(/_/g, " ")}
                  </Badge>
                  {isAiPending && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-warning animate-pulse">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Processing in background (auto-updating)...</span>
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  Gemini 3.6 analysis powers summaries, interpretation, and extracted text.
                </p>
                {document.aiProcessing?.status === "FAILED" &&
                  document.aiProcessing.errorMessage && (
                    <p className="mt-1 text-[11px] text-danger">
                      {document.aiProcessing.errorMessage}
                    </p>
                  )}
              </div>
            </div>

            {isOwner && (
              <Button
                variant={document.aiProcessing?.status === "FAILED" ? "primary" : "secondary"}
                onClick={handleRetryAi}
                disabled={isRetryingAi}
                className="shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${isRetryingAi ? "animate-spin" : ""}`} />
                {document.aiProcessing?.status === "FAILED"
                  ? "Retry AI processing"
                  : document.aiProcessing?.status
                    ? "Re-run AI analysis"
                    : "Enable AI processing"}
              </Button>
            )}
          </div>
          {aiErrorMessage && (
            <Alert variant="danger" className="mt-3 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{aiErrorMessage}</span>
            </Alert>
          )}
          {extractedMetadata?.expiryDate && (
            <div className="mt-3 rounded-lg border border-success/20 bg-success-subtle/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-text-primary">
                  Expiry date detected by AI
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="default">
                    {Math.round((extractedMetadata.expiryDateConfidence || 0) * 100)}% confidence
                  </Badge>
                  <Badge variant={extractedExpiryIsEffective ? "success" : "warning"}>
                    {extractedExpiryIsEffective ? "Applied to reminders" : "Review suggested date"}
                  </Badge>
                </div>
              </div>
              <p className="mt-1 text-sm font-medium text-text-primary">
                {safeFormatDate(extractedMetadata.expiryDate)}
              </p>
              {extractedMetadata.expiryDateEvidence && (
                <p className="mt-1 text-[11px] text-text-muted">
                  Evidence: “{extractedMetadata.expiryDateEvidence}”
                </p>
              )}
              <p className="mt-1 text-[11px] text-text-muted">
                {extractedExpiryIsEffective
                  ? "This date is used for expiry reminders. You can correct it in the review controls below."
                  : "This date was not applied automatically. Verify it and save the reviewed date in the controls below."}
              </p>
            </div>
          )}
          {Boolean(
            extractedMetadata?.expiryDate || document.expiryDate || reviewImportantDates.length > 0,
          ) && (
            <div className="mt-3 rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
              <p className="text-xs font-semibold text-text-primary">Important dates detected</p>
              <p className="mt-1 text-[11px] text-text-muted">
                Review extracted dates and correct uncertain values. Saving updates the related
                reminders.
              </p>
              {isOwner && Boolean(extractedMetadata?.expiryDate || document.expiryDate) && (
                <div className="mt-3 max-w-xs space-y-1">
                  <label
                    className="text-xs font-medium text-text-secondary"
                    htmlFor="review-expiry-date"
                  >
                    Document expiry date
                  </label>
                  <input
                    id="review-expiry-date"
                    type="date"
                    value={reviewExpiryDate}
                    onChange={(event) => setReviewExpiryDate(event.target.value)}
                    className="input w-full"
                  />
                </div>
              )}
              <div className="mt-3 space-y-3">
                {reviewImportantDates.map((item, index) => (
                  <div
                    key={`${item.type}-${index}`}
                    className="grid gap-2 border-t border-border-subtle pt-2 first:border-0 first:pt-0 sm:grid-cols-[1fr_180px]"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary">{item.type}</p>
                      {item.evidence && (
                        <p className="mt-0.5 text-[11px] text-text-muted">
                          Evidence: “{item.evidence}”
                        </p>
                      )}
                      <Badge variant={item.confidence >= 0.85 ? "success" : "warning"}>
                        {Math.round(item.confidence * 100)}% confidence
                      </Badge>
                    </div>
                    {isOwner ? (
                      <input
                        aria-label={`${item.type} date`}
                        type="date"
                        value={item.date}
                        onChange={(event) =>
                          setReviewImportantDates((items) =>
                            items.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, date: event.target.value } : entry,
                            ),
                          )
                        }
                        className="input w-full"
                      />
                    ) : (
                      <p className="text-xs text-text-muted">
                        {item.date ? safeFormatDate(item.date, "Not set") : "Not set"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {isOwner && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={saveReviewedDates} disabled={savingDates}>
                    {savingDates ? "Saving…" : "Save reviewed dates"}
                  </Button>
                  {dateReviewMessage && (
                    <span className="text-xs text-text-muted">{dateReviewMessage}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <Tab
            value="preview"
            active={activeTab === "preview"}
            onClick={() => setActiveTab("preview")}
            icon={<Eye className="w-4 h-4" />}
          >
            Preview
          </Tab>
          <Tab
            value="summary"
            active={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
            icon={<Sparkles className="w-4 h-4 text-warning" />}
          >
            Summary
          </Tab>
          <Tab
            value="interpretation"
            active={activeTab === "interpretation"}
            onClick={() => setActiveTab("interpretation")}
            icon={<FileText className="w-4 h-4 text-brand" />}
          >
            Interpretation
          </Tab>
          <Tab
            value="text"
            active={activeTab === "text"}
            onClick={() => setActiveTab("text")}
            icon={<FileCode className="w-4 h-4 text-success" />}
          >
            Text
          </Tab>
        </Tabs>

        <div className="pt-6 pb-6">
          <div
            className={`w-full h-[82vh] md:h-[88vh] min-h-[700px] flex items-center justify-center rounded-lg bg-surface-muted border border-border-subtle overflow-hidden ${
              activeTab === "preview" ? "" : "hidden"
            }`}
          >
            <ErrorBoundary
              fallback={
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 min-h-[360px]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger shadow-2xs">
                    <CloudOff className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">
                      File not found on Google Drive
                    </h3>
                    <p className="text-xs text-text-muted max-w-md mt-1">
                      The file for &ldquo;{document.name}&rdquo; could not be retrieved from your
                      connected Google Drive storage. It may have been moved, renamed, or deleted in
                      Drive.
                    </p>
                  </div>
                  {document.thumbnailUrl && (
                    <div className="mt-2 p-2 border border-border-subtle rounded-xl bg-surface max-w-xs shadow-2xs">
                      <p className="text-[10px] text-text-muted mb-1 font-medium">
                        Cached Thumbnail Preview
                      </p>
                      <img
                        src={document.thumbnailUrl}
                        alt={document.name}
                        className="max-h-48 w-auto mx-auto object-contain rounded-lg border border-border-subtle"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Retry Preview
                    </Button>
                    {isOwner && (
                      <Button size="sm" onClick={() => setIsPropertiesOpen(true)}>
                        <Edit3 className="h-3.5 w-3.5 mr-1" />
                        Edit Properties
                      </Button>
                    )}
                    {isOwner && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleDeleteDocument}
                        className="text-danger hover:bg-danger/10"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete Document
                      </Button>
                    )}
                  </div>
                </div>
              }
            >
              <DocumentViewer
                fileUrl={fileProxyUrl}
                mimeType={document.mimeType}
                fileName={document.name}
                thumbnailUrl={document.thumbnailUrl}
                onEdit={isOwner ? () => setIsPropertiesOpen(true) : undefined}
              />
            </ErrorBoundary>
          </div>

          {activeTab === "summary" && (
            <div className="space-y-4">
              {document.aiProcessing?.summaryMarkdown ? (
                <div className="p-6 rounded-lg bg-surface-muted border border-border-subtle leading-relaxed text-sm text-text-primary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {document.aiProcessing.summaryMarkdown}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="p-8 text-center text-text-muted text-xs italic">
                  No AI summary has been generated for this document yet. You can trigger AI
                  processing from Document Properties.
                </div>
              )}
            </div>
          )}

          {activeTab === "interpretation" && (
            <div className="space-y-4">
              <Alert variant="warning" className="text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Informational AI Interpretation • Note: AI output does not constitute medical or
                  legal advice.
                </span>
              </Alert>

              {document.aiProcessing?.interpretationMarkdown ? (
                <div className="p-6 rounded-lg bg-surface-muted border border-border-subtle leading-relaxed text-sm text-text-primary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {document.aiProcessing.interpretationMarkdown}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="p-8 text-center text-text-muted text-xs italic">
                  No AI interpretation available.
                </div>
              )}
            </div>
          )}

          {activeTab === "text" && (
            <div className="space-y-4">
              <Alert variant="info" className="text-xs">
                <FileCode className="w-4 h-4 shrink-0" />
                <span>
                  Raw text extracted by Gemini OCR (Derived data, original file remains source of
                  truth)
                </span>
              </Alert>
              {document.aiProcessing?.extractedText ? (
                <pre className="p-5 rounded-lg bg-surface-muted border border-border-subtle text-xs font-mono text-text-secondary whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                  {document.aiProcessing.extractedText}
                </pre>
              ) : (
                <div className="p-8 text-center text-text-muted text-xs italic">
                  No extracted text recorded.
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <DocumentPropertiesModal
        isOpen={isPropertiesOpen}
        onClose={() => setIsPropertiesOpen(false)}
        document={document}
        folders={folders}
        isOwner={isOwner}
        onDocumentUpdated={refreshData}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        documentId={document.id}
        documentName={document.name}
        isOwner={isOwner}
      />

      <DocumentQA
        documentId={document.id}
        documentName={document.name}
        isOpen={isQaOpen}
        onClose={() => setIsQaOpen(false)}
      />

      <CameraScanModal
        isOpen={isAddPageOpen}
        onClose={() => setIsAddPageOpen(false)}
        targetDocumentId={document.id}
        targetDocumentName={document.name}
        onAppendComplete={() => {
          refreshData();
        }}
      />
    </>
  );
}

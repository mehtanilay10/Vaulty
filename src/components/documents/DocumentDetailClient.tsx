"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { DocumentPropertiesModal } from "@/components/documents/DocumentPropertiesModal";
import { Button } from "@/components/ui/Button";
import { Tabs, Tab } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  Download,
  Settings,
  Sparkles,
  ChevronRight,
  Eye,
  FileCode,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Lock,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";

export function DocumentDetailClient({
  document,
  folders,
  isOwner,
  permission,
}: {
  document: any;
  folders: any[];
  isOwner: boolean;
  permission: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"preview" | "summary" | "interpretation" | "text">(
    "preview"
  );
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isRetryingAi, setIsRetryingAi] = useState(false);
  const storageLabel = document?.storageProvider === "GOOGLE_DRIVE" ? "Google Drive" : "Vercel Blob";

  const fileProxyUrl = `/api/documents/${document.id}/file`;
  const isPdf = document.mimeType === "application/pdf";
  const isImage = document.mimeType.startsWith("image/");

  const refreshData = () => {
    router.refresh();
  };

  const handleRetryAi = async () => {
    setIsRetryingAi(true);
    try {
      await fetch(`/api/documents/${document.id}/ai`, { method: "POST" });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRetryingAi(false);
    }
  };

  return (
    <AppShell>
      <nav className="flex items-center gap-2 text-xs text-text-muted overflow-x-auto py-1">
        <Link href="/documents" className="hover:text-text-primary transition-colors">
          Documents
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
        <Link
          href={`/folders/${document.folder?.id}`}
          className="hover:text-text-primary transition-colors"
        >
          {document.folder?.name}
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
        <span className="font-semibold text-brand truncate">{document.name}</span>
      </nav>

      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-lg bg-brand-subtle text-brand shrink-0">
              <FileText className="w-7 h-7" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-text-primary tracking-tight truncate">
                  {document.name}
                </h1>
                {!isOwner && (
                  <Badge variant="info" className="text-xs">
                    <Lock className="w-3 h-3" /> Shared Read Only
                  </Badge>
                )}
              </div>

              <p className="text-xs text-text-secondary">
                Folder: <Link href={`/folders/${document.folder?.id}`} className="text-brand hover:underline">{document.folder?.name}</Link> • Storage: <span className="text-brand">{storageLabel}</span> • Uploaded: {new Date(document.createdAt).toLocaleDateString()} • Owner: {isOwner ? "You" : document.owner?.name || document.owner?.email}
              </p>

              {document.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {document.tags.map((t: any) => (
                    <span
                      key={t.tag.id}
                      className="px-2 py-0.5 rounded-md bg-surface-muted text-text-secondary text-[10px] font-medium"
                    >
                      #{t.tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {document.storageProvider === "GOOGLE_DRIVE" && document.storageWebViewLink && (
              <a
                href={document.storageWebViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open in Drive</span>
              </a>
            )}
            <a
              href={fileProxyUrl}
              download={document.name}
              className="btn-secondary text-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-brand" />
              <span>Download</span>
            </a>

            <button
              onClick={() => setIsPropertiesOpen(true)}
              className="p-2.5 rounded-md btn-ghost cursor-pointer"
              title="Document Properties"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>

      {document.aiProcessing && (
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-warning shrink-0" />
              <div>
                <span className="font-bold text-text-primary">Gemini 2.0 AI Status: </span>
                <span className="text-text-secondary font-mono uppercase font-semibold">
                  {document.aiProcessing.status}
                </span>
                {document.aiProcessing.errorMessage && (
                  <p className="text-danger mt-0.5">{document.aiProcessing.errorMessage}</p>
                )}
              </div>
            </div>

            {isOwner && document.aiProcessing.status === "FAILED" && (
              <button
                onClick={handleRetryAi}
                disabled={isRetryingAi}
                className="px-3 py-1.5 rounded-md bg-warning hover:bg-warning text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetryingAi ? "animate-spin" : ""}`} />
                <span>Retry AI Processing</span>
              </button>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <Tab value="preview" active={activeTab === "preview"} onClick={() => setActiveTab("preview")} icon={<Eye className="w-4 h-4" />}>
            Preview
          </Tab>
          <Tab value="summary" active={activeTab === "summary"} onClick={() => setActiveTab("summary")} icon={<Sparkles className="w-4 h-4 text-warning" />}>
            Summary
          </Tab>
          <Tab value="interpretation" active={activeTab === "interpretation"} onClick={() => setActiveTab("interpretation")} icon={<FileText className="w-4 h-4 text-brand" />}>
            Interpretation
          </Tab>
          <Tab value="text" active={activeTab === "text"} onClick={() => setActiveTab("text")} icon={<FileCode className="w-4 h-4 text-success" />}>
            Text
          </Tab>
        </Tabs>

        <div className="p-6">
          {activeTab === "preview" && (
            <div className="w-full h-[600px] flex items-center justify-center rounded-lg bg-surface-muted border border-border-subtle overflow-hidden">
              {isPdf ? (
                <iframe
                  src={fileProxyUrl}
                  className="w-full h-full border-0 rounded-lg"
                  title={document.name}
                />
              ) : isImage ? (
                <div className="relative w-full h-full flex items-center justify-center p-4">
                  <img
                    src={fileProxyUrl}
                    alt={document.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  />
                </div>
              ) : (
                <div className="text-center p-8 space-y-3">
                  <FileText className="w-12 h-12 text-text-muted mx-auto" />
                  <p className="text-sm font-semibold text-text-secondary">File Preview Unavailable</p>
                  <a
                    href={fileProxyUrl}
                    download={document.name}
                    className="btn-primary text-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download to view ({document.mimeType})</span>
                  </a>
                </div>
              )}
            </div>
          )}

          {activeTab === "summary" && (
            <div className="space-y-4">
              <Alert variant="info" className="text-xs">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>AI-Generated Summary via Gemini 2.0 Flash</span>
              </Alert>

              {document.aiProcessing?.summaryMarkdown ? (
                <div className="p-6 rounded-lg bg-surface-muted border border-border-subtle leading-relaxed text-sm text-text-primary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {document.aiProcessing.summaryMarkdown}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="p-8 text-center text-text-muted text-xs italic">
                  No AI summary has been generated for this document yet. You can trigger AI processing from Document Properties.
                </div>
              )}
            </div>
          )}

          {activeTab === "interpretation" && (
            <div className="space-y-4">
              <Alert variant="warning" className="text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Informational AI Interpretation • Note: AI output does not constitute medical or legal advice.
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
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">
                Raw text extracted by Gemini OCR (Derived data, original file remains source of truth):
              </p>
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
    </AppShell>
  );
}

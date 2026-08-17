"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { DocumentPropertiesModal } from "@/components/documents/DocumentPropertiesModal";
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
  const storageColor = document?.storageProvider === "GOOGLE_DRIVE" ? "text-indigo-400" : "text-blue-400";

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
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 overflow-x-auto py-1">
            <Link href="/documents" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Documents
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
            <Link
              href={`/folders/${document.folder?.id}`}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              📁 {document.folder?.name}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
            <span className="font-bold text-amber-600 dark:text-amber-400 truncate">{document.name}</span>
          </nav>

          {/* Header Card */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-start gap-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <FileText className="w-7 h-7" />
              </div>
              <div className="space-y-1 truncate">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight truncate">
                    {document.name}
                  </h1>
                  {!isOwner && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold border border-indigo-500/20">
                      <Lock className="w-3 h-3" /> Shared Read Only
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Folder: <Link href={`/folders/${document.folder?.id}`} className="text-amber-600 dark:text-amber-400 hover:underline">{document.folder?.name}</Link> &bull; Storage: <span className={storageColor}>{storageLabel}</span> &bull; Uploaded: {new Date(document.createdAt).toLocaleDateString()} &bull; Owner: {isOwner ? "You" : document.owner?.name || document.owner?.email}
                </p>

                {document.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {document.tags.map((t: any) => (
                      <span
                        key={t.tag.id}
                        className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-amber-700 dark:text-amber-300 text-[10px] font-medium"
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
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-medium border border-indigo-500/20 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in Drive</span>
                </a>
              )}
              <a
                href={fileProxyUrl}
                download={document.name}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium text-xs border border-slate-200 dark:border-slate-700/80 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Download</span>
              </a>

              <button
                onClick={() => setIsPropertiesOpen(true)}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors cursor-pointer"
                title="Document Properties"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* AI Status Banner */}
          {document.aiProcessing && (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Gemini 2.0 AI Status: </span>
                  <span className="text-slate-600 dark:text-slate-300 font-mono uppercase font-semibold">
                    {document.aiProcessing.status}
                  </span>
                  {document.aiProcessing.errorMessage && (
                    <p className="text-rose-500 dark:text-rose-400 mt-0.5">{document.aiProcessing.errorMessage}</p>
                  )}
                </div>
              </div>

              {isOwner && document.aiProcessing.status === "FAILED" && (
                <button
                  onClick={handleRetryAi}
                  disabled={isRetryingAi}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetryingAi ? "animate-spin" : ""}`} />
                  <span>Retry AI Processing</span>
                </button>
              )}
            </div>
          )}

          {/* Content View Tabs */}
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-3xl overflow-hidden flex flex-col min-h-[500px] shadow-xl">
            {/* Tabs Header */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-4 md:px-6 overflow-x-auto">
              <button
                onClick={() => setActiveTab("preview")}
                className={`py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 shrink-0 ${
                  activeTab === "preview"
                    ? "border-amber-500 text-amber-600 dark:text-amber-400 font-bold"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>Document Preview</span>
              </button>

              <button
                onClick={() => setActiveTab("summary")}
                className={`py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 shrink-0 ${
                  activeTab === "summary"
                    ? "border-amber-500 text-amber-600 dark:text-amber-400 font-bold"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>AI Summary</span>
              </button>

              <button
                onClick={() => setActiveTab("interpretation")}
                className={`py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 shrink-0 ${
                  activeTab === "interpretation"
                    ? "border-amber-500 text-amber-600 dark:text-amber-400 font-bold"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <FileText className="w-4 h-4 text-blue-500" />
                <span>AI Interpretation</span>
              </button>

              <button
                onClick={() => setActiveTab("text")}
                className={`py-3.5 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 shrink-0 ${
                  activeTab === "text"
                    ? "border-amber-500 text-amber-600 dark:text-amber-400 font-bold"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <FileCode className="w-4 h-4 text-emerald-500" />
                <span>Extracted Text</span>
              </button>
            </div>

            {/* Tab Body */}
            <div className="p-6 flex-1">
              {activeTab === "preview" && (
                <div className="w-full h-[600px] flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {isPdf ? (
                    <iframe
                      src={fileProxyUrl}
                      className="w-full h-full border-0 rounded-2xl"
                      title={document.name}
                    />
                  ) : isImage ? (
                    <div className="relative w-full h-full flex items-center justify-center p-4">
                      <img
                        src={fileProxyUrl}
                        alt={document.name}
                        className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                      />
                    </div>
                  ) : (
                    <div className="text-center p-8 space-y-3">
                      <FileText className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">File Preview Unavailable</p>
                      <a
                        href={fileProxyUrl}
                        download={document.name}
                        className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center gap-2"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download to view ({document.mimeType})</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "summary" && (
                <div className="prose dark:prose-invert max-w-none space-y-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2 font-medium">
                    <Sparkles className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>AI-Generated Summary via Gemini 2.0 Flash</span>
                  </div>

                  {document.aiProcessing?.summaryMarkdown ? (
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 leading-relaxed text-sm text-slate-800 dark:text-slate-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {document.aiProcessing.summaryMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs italic">
                      No AI summary has been generated for this document yet. You can trigger AI processing from Document Properties.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "interpretation" && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>
                      Informational AI Interpretation &bull; Note: AI output does not constitute medical or legal advice.
                    </span>
                  </div>

                  {document.aiProcessing?.interpretationMarkdown ? (
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 leading-relaxed text-sm text-slate-800 dark:text-slate-200 prose dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {document.aiProcessing.interpretationMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs italic">
                      No AI interpretation available.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "text" && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Raw text extracted by Gemini OCR (Derived data, original file remains source of truth):
                  </p>
                  {document.aiProcessing?.extractedText ? (
                    <pre className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                      {document.aiProcessing.extractedText}
                    </pre>
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs italic">
                      No extracted text recorded.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <MobileNav />

      <DocumentPropertiesModal
        isOpen={isPropertiesOpen}
        onClose={() => setIsPropertiesOpen(false)}
        document={document}
        folders={folders}
        isOwner={isOwner}
        onDocumentUpdated={refreshData}
      />
    </div>
  );
}

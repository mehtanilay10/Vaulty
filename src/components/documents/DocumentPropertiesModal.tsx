"use client";

import { useState, useEffect } from "react";
import { X, FileText, Edit3, Trash2, Tag, Folder, AlertTriangle, Sparkles, Check, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function DocumentPropertiesModal({
  isOpen,
  onClose,
  document,
  folders,
  isOwner,
  onDocumentUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  document: any;
  folders: any[];
  isOwner: boolean;
  onDocumentUpdated?: () => void;
}) {
  const router = useRouter();
  const [docName, setDocName] = useState(document?.name || "");
  const [targetFolderId, setTargetFolderId] = useState(document?.folderId || "");
  const [tagsStr, setTagsStr] = useState(
    document?.tags?.map((t: any) => t.tag.name).join(", ") || ""
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isAiRetrying, setIsAiRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const storageLabel = document?.storageProvider === "GOOGLE_DRIVE" ? "Google Drive" : "Vercel Blob";

  useEffect(() => {
    if (document) {
      setDocName(document.name);
      setTargetFolderId(document.folderId);
      setTagsStr(document.tags?.map((t: any) => t.tag.name).join(", ") || "");
    }
  }, [document]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const tagsArray = tagsStr
        .split(",")
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);

      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: docName.trim(),
          folderId: targetFolderId,
          tags: tagsArray,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed.");

      setSuccessMsg("Document properties updated successfully.");
      if (onDocumentUpdated) onDocumentUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to update document.");
    }
  };

  const handleRetryAi = async () => {
    setIsAiRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}/ai`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI processing failed to start.");

      setSuccessMsg("AI processing initiated. Refreshing...");
      if (onDocumentUpdated) onDocumentUpdated();
    } catch (err: any) {
      setError(err?.message || "AI retry failed.");
    } finally {
      setIsAiRetrying(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete document.");

      onClose();
      router.push(`/folders/${document.folderId}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to delete document.");
      setIsDeleting(false);
    }
  };

  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white truncate max-w-xs">{document.name}</h2>
              <p className="text-xs text-slate-400">Document Properties &amp; Settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {!isOwner ? (
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-white">Read Only Document</p>
              <p>You are viewing a shared document. Only the owner can rename, move, re-tag, or delete this file.</p>
            </div>
          ) : (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Document Name
                </label>
                <input
                  type="text"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Folder Location
                </label>
                <select
                  value={targetFolderId}
                  onChange={(e) => setTargetFolderId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tags (Comma separated)
                </label>
                <input
                  type="text"
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="e.g. medical, prescription, 2026"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* AI Trigger / Retry Section */}
          {isOwner && (
            <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Gemini AI Processing</span>
                </div>
                <span className="text-[10px] uppercase font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                  {document.aiProcessing?.status || "NOT_REQUESTED"}
                </span>
              </div>

              <p className="text-[11px] text-slate-400">
                Trigger or re-run Gemini AI document analysis to generate structured summaries and text extraction.
              </p>

              <button
                onClick={handleRetryAi}
                disabled={isAiRetrying}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAiRetrying ? "animate-spin" : ""}`} />
                <span>
                  {document.aiProcessing?.status === "FAILED"
                    ? "Retry Failed AI Processing"
                    : "Re-run Gemini AI Analysis"}
                </span>
              </button>
            </div>
          )}

          {/* Delete Action Zone */}
          {isOwner && (
            <div className="pt-4 border-t border-slate-800">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 font-medium text-xs transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Document</span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Confirm Document Deletion</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Are you sure you want to delete &quot;{document.name}&quot;? The file will be permanently removed from {storageLabel}.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isDeleting ? "Deleting..." : "Permanently Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

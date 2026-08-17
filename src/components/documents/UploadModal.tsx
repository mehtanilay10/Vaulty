"use client";

import { useState, useEffect } from "react";
import { X, Upload, FileText, Sparkles, Folder, Tag, AlertCircle, Camera, Check, HardDrive } from "lucide-react";

interface FolderOption {
  id: string;
  name: string;
}

export function UploadModal({
  isOpen,
  onClose,
  initialFolderId,
  onUploadSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialFolderId?: string;
  onUploadSuccess?: () => void;
}) {
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId || "");
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [tags, setTags] = useState("");
  const [generateAi, setGenerateAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageProvider, setStorageProvider] = useState<"GOOGLE_DRIVE" | "VERCEL_BLOB">("GOOGLE_DRIVE");

  useEffect(() => {
    if (isOpen) {
      fetchFolders();
      fetchDefaultProvider();
    }
  }, [isOpen]);

  const fetchDefaultProvider = async () => {
    try {
      const res = await fetch("/api/user/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.defaultStorageProvider) {
          setStorageProvider(data.defaultStorageProvider);
        }
      }
    } catch (err) {
      console.error("Failed to fetch default provider:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFolders();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialFolderId) {
      setSelectedFolderId(initialFolderId);
    }
  }, [initialFolderId]);

  const fetchFolders = async () => {
    try {
      const res = await fetch("/api/folders");
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
        if (!selectedFolderId && data.folders?.length > 0) {
          setSelectedFolderId(data.folders[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching folders:", err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!docName) {
        setDocName(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    if (!selectedFolderId) {
      setError("Please select a folder.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folderId", selectedFolderId);
      formData.append("name", docName || file.name);
      formData.append("tags", tags);
      formData.append("generateAi", String(generateAi));

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      // Reset form & close
      setFile(null);
      setDocName("");
      setTags("");
      onClose();
      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      setError(err?.message || "Failed to upload document.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Upload Document</h2>
              <p className="text-xs text-slate-400">Add PDF or images to your private vault</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* File Selector Zone */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select Document (PDF, JPEG, PNG, WebP)
            </label>
            <div className="relative border-2 border-dashed border-slate-700/80 hover:border-indigo-500/50 rounded-2xl p-6 text-center transition-colors bg-slate-950/40">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-8 h-8 text-indigo-400" />
                {file ? (
                  <div className="text-sm font-semibold text-emerald-400 truncate max-w-full">
                    ✓ {file.name} ({Math.round(file.size / 1024)} KB)
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-300 font-medium">
                      Click or drag file to upload
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span>PDF, JPG, PNG up to 50MB</span>
                      <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-md">
                        <Camera className="w-3 h-3" /> Camera supported
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Document Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Document Display Name
            </label>
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Blood Test Report Aug 2026"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          {/* Folder Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Destination Folder
            </label>
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {folders.length === 0 ? (
                <option value="">No folders found. Create one first.</option>
              ) : (
                folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Free-form Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Tags (Comma separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. medical, blood-test, 2026"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          {/* Storage Provider Indicator */}
          <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">Storage Provider</p>
                <p className="text-[11px] text-slate-400">
                  {storageProvider === "GOOGLE_DRIVE" ? "Google Drive" : "Vercel Blob"}
                </p>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
              {storageProvider === "GOOGLE_DRIVE" ? "Drive" : "Blob"}
            </span>
          </div>

          {/* AI Checkbox */}
          <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">Generate Gemini AI Summary</p>
                <p className="text-[11px] text-slate-400">OCR extraction, structured summary &amp; interpretation</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={generateAi}
              onChange={(e) => setGenerateAi(e.target.checked)}
              className="w-5 h-5 rounded accent-indigo-600 cursor-pointer"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file || !selectedFolderId}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? "Uploading to Vault..." : "Upload Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

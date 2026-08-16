"use client";

import { useState } from "react";
import { X, FolderPlus, AlertCircle } from "lucide-react";

export function CreateFolderModal({
  isOpen,
  onClose,
  parentId,
  onFolderCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  parentId?: string | null;
  onFolderCreated?: () => void;
}) {
  const [folderName, setFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setError("Folder name cannot be empty.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: folderName.trim(),
          parentId: parentId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create folder.");
      }

      setFolderName("");
      onClose();
      if (onFolderCreated) onFolderCreated();
    } catch (err: any) {
      setError(err?.message || "Failed to create folder.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Create New Folder</h2>
              <p className="text-xs text-slate-400">Organize your private documents</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Folder Name
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. Medical Reports, Government IDs"
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !folderName.trim()}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? "Creating..." : "Create Folder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

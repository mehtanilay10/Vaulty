"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { UploadModal } from "@/components/documents/UploadModal";
import { FileText, Filter, Search, Tag, Upload, CheckCircle2, Loader2, AlertTriangle, Folder } from "lucide-react";
import { useRouter } from "next/navigation";

export function DocumentsClient({
  initialDocuments,
  folders,
}: {
  initialDocuments: any[];
  folders: any[];
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [filterFolderId, setFilterFolderId] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const filteredDocs = documents.filter((doc) => {
    const matchesFolder = filterFolderId ? doc.folderId === filterFolderId : true;
    const matchesSearch = searchFilter
      ? doc.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        doc.tags.some((t: any) => t.tag.name.toLowerCase().includes(searchFilter.toLowerCase()))
      : true;
    return matchesFolder && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      <Navbar onOpenUpload={() => setIsUploadOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <FileText className="w-7 h-7 text-amber-500" />
                <span>My Documents</span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-light">
                All private documents in your personal vault ({documents.length})
              </p>
            </div>

            <button
              onClick={() => setIsUploadOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-bold text-sm shadow-md shadow-amber-500/20 hover:scale-[1.02] transition-all cursor-pointer w-fit"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Document</span>
            </button>
          </div>

          {/* Filters Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter by name or tag..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={filterFolderId}
                onChange={(e) => setFilterFolderId(e.target.value)}
                className="w-full sm:w-56 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="">All Folders</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Document Cards */}
          {filteredDocs.length === 0 ? (
            <div className="p-12 rounded-3xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-center space-y-3 shadow-sm">
              <FileText className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-300">No documents found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No files matched your filters. Upload a document or clear your search criteria.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredDocs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-800/80 hover:border-amber-500/40 transition-all group flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                        <FileText className="w-6 h-6" />
                      </div>

                      {doc.aiProcessing?.status === "COMPLETED" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> AI Ready
                        </span>
                      )}
                      {doc.aiProcessing?.status === "PROCESSING" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium border border-amber-500/20">
                          <Loader2 className="w-3 h-3 animate-spin" /> Processing
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-white truncate mb-1">
                      {doc.name}
                    </h3>
                    <p className="text-xs text-slate-500 truncate mb-3">
                      📁 {doc.folder?.name}
                    </p>

                    {doc.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {doc.tags.map((t: any) => (
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

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500">
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    <span>{Math.round(doc.sizeBytes / 1024)} KB</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>

      <MobileNav onOpenUpload={() => setIsUploadOpen(true)} />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => router.refresh()}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { UploadModal } from "@/components/documents/UploadModal";
import { FileText, Filter, Search, Tag, Upload, CheckCircle2, Loader2, AlertTriangle, Folder, Cloud, HardDrive } from "lucide-react";
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
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col transition-colors">
      <Navbar onOpenUpload={() => setIsUploadOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
                <FileText className="w-7 h-7 text-accent-primary" />
                <span>My Documents</span>
              </h1>
              <p className="text-text-secondary text-sm mt-1 font-light">
                All private documents in your personal vault ({documents.length})
              </p>
            </div>

            <button
              onClick={() => setIsUploadOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl vault-btn-primary text-sm cursor-pointer w-fit"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Document</span>
            </button>
          </div>

          <div className="vault-card p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter by name or tag..."
                className="vault-input w-full pl-10 pr-4 py-2 text-sm placeholder:text-text-muted"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-text-muted shrink-0" />
              <select
                value={filterFolderId}
                onChange={(e) => setFilterFolderId(e.target.value)}
                className="vault-input w-full sm:w-56 px-3 py-2 text-sm text-text-secondary"
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

          {filteredDocs.length === 0 ? (
            <div className="vault-card p-12 text-center space-y-3">
              <FileText className="w-12 h-12 text-text-muted mx-auto" />
              <h3 className="text-base font-semibold text-text-secondary">No documents found</h3>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                No files matched your filters. Upload a document or clear your search criteria.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredDocs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="vault-card vault-card-hover p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="p-3 rounded-xl bg-accent-primary-soft text-accent-primary group-hover:scale-105 transition-transform">
                        <FileText className="w-6 h-6" />
                      </div>

                      {doc.aiProcessing?.status === "COMPLETED" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-emerald-soft text-accent-emerald text-[10px] font-medium border border-accent-emerald/20">
                          <CheckCircle2 className="w-3 h-3" /> AI Ready
                        </span>
                      )}
                      {doc.aiProcessing?.status === "PROCESSING" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-secondary-soft text-accent-secondary text-[10px] font-medium border border-accent-secondary/20">
                          <Loader2 className="w-3 h-3 animate-spin" /> Processing
                        </span>
                      )}
                    </div>

                     <h3 className="font-semibold text-sm text-text-primary truncate mb-1">
                       {doc.name}
                     </h3>
                     <p className="text-xs text-text-muted truncate mb-3">
                       📁 {doc.folder?.name}
                     </p>

                     {doc.storageProvider && (
                       <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${doc.storageProvider === "GOOGLE_DRIVE" ? "bg-accent-primary-soft text-accent-primary border-accent-primary/20" : "bg-accent-primary-soft text-accent-primary border-accent-primary/20"}`}>
                         {doc.storageProvider === "GOOGLE_DRIVE" ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
                         {doc.storageProvider === "GOOGLE_DRIVE" ? "Drive" : "Blob"}
                       </span>
                     )}

                    {doc.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {doc.tags.map((t: any) => (
                          <span
                            key={t.tag.id}
                            className="px-2 py-0.5 rounded-md bg-bg-muted text-text-secondary text-[10px] font-medium"
                          >
                            #{t.tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border-subtle text-[11px] text-text-muted">
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

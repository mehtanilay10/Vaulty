"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { CreateFolderModal } from "@/components/folders/CreateFolderModal";
import { UploadModal } from "@/components/documents/UploadModal";
import { FolderPropertiesModal } from "@/components/folders/FolderPropertiesModal";
import {
  Folder,
  FileText,
  ChevronRight,
  FolderPlus,
  Upload,
  Settings,
  Users,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";

export function FolderDetailClient({
  folder,
  breadcrumbs,
  isOwner,
  permission,
}: {
  folder: any;
  breadcrumbs: { id: string; name: string }[];
  isOwner: boolean;
  permission: string;
}) {
  const router = useRouter();
  const [isCreateSubfolderOpen, setIsCreateSubfolderOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);

  const refreshData = () => {
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      <Navbar onOpenUpload={isOwner ? () => setIsUploadOpen(true) : undefined} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 overflow-x-auto py-1">
            <Link href="/folders" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Folders
            </Link>
            {breadcrumbs.map((b, idx) => (
              <div key={b.id} className="flex items-center gap-2 shrink-0">
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
                {idx === breadcrumbs.length - 1 ? (
                  <span className="font-bold text-amber-600 dark:text-amber-400">{b.name}</span>
                ) : (
                  <Link href={`/folders/${b.id}`} className="hover:text-slate-900 dark:hover:text-white transition-colors">
                    {b.name}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Folder Title Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-3.5">
              <div className="p-3.5 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Folder className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{folder.name}</h1>
                  {!isOwner && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold border border-indigo-500/20">
                      <Lock className="w-3 h-3" /> Shared Read Only
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Owner: {folder.owner?.name || folder.owner?.email} &bull; {folder.documents?.length || 0} files &bull; {folder.children?.length || 0} subfolders
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPropertiesOpen(true)}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 transition-colors cursor-pointer"
                title="Folder Properties & Sharing"
              >
                <Settings className="w-4 h-4" />
              </button>

              {isOwner && (
                <>
                  <button
                    onClick={() => setIsCreateSubfolderOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium text-xs border border-slate-200 dark:border-slate-700/80 transition-colors cursor-pointer"
                  >
                    <FolderPlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>New Subfolder</span>
                  </button>
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 hover:scale-[1.02] transition-all cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload File</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Nested Subfolders */}
          {folder.children?.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Subfolders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {folder.children.map((sub: any) => (
                  <Link
                    key={sub.id}
                    href={`/folders/${sub.id}`}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-800/80 hover:border-blue-500/40 transition-all flex items-center gap-3 group shadow-sm"
                  >
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-white truncate">
                        {sub.name}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {sub._count?.documents || 0} files
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Folder Documents */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Documents in this folder ({folder.documents?.length || 0})
            </h2>

            {folder.documents?.length === 0 ? (
              <div className="p-10 rounded-3xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-center space-y-2 shadow-sm">
                <FileText className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">This folder is empty</p>
                {isOwner && (
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Document to {folder.name}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {folder.documents.map((doc: any) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-800/80 hover:border-amber-500/40 transition-all group flex flex-col justify-between shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                          <FileText className="w-5 h-5" />
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

                      <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-white truncate mb-2">
                        {doc.name}
                      </h3>

                      {doc.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
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
          </section>
        </main>
      </div>

      <MobileNav onOpenUpload={isOwner ? () => setIsUploadOpen(true) : undefined} />

      <CreateFolderModal
        isOpen={isCreateSubfolderOpen}
        onClose={() => setIsCreateSubfolderOpen(false)}
        parentId={folder.id}
        onFolderCreated={refreshData}
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        initialFolderId={folder.id}
        onUploadSuccess={refreshData}
      />

      <FolderPropertiesModal
        isOpen={isPropertiesOpen}
        onClose={() => setIsPropertiesOpen(false)}
        folder={folder}
        isOwner={isOwner}
        onFolderUpdated={refreshData}
      />
    </div>
  );
}

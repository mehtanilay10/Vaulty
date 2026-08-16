"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { UploadModal } from "@/components/documents/UploadModal";
import { CreateFolderModal } from "@/components/folders/CreateFolderModal";
import {
  Folder,
  FileText,
  Users,
  Upload,
  FolderPlus,
  Sparkles,
  ArrowRight,
  Shield,
  Clock,
  ChevronRight,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";

export function DashboardClient({
  user,
  recentDocuments,
  myFolders,
  sharedFolders,
  stats,
}: {
  user: any;
  recentDocuments: any[];
  myFolders: any[];
  sharedFolders: any[];
  stats: { totalDocuments: number; totalFolders: number; aiSummaries: number };
}) {
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);

  const refreshData = () => {
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      <Navbar onOpenUpload={() => setIsUploadOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
          {/* Welcome Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Welcome back, {user?.name?.split(" ")[0] || "User"} 👋
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-light">
                Your private document vault is secured and up to date.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCreateFolderOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium text-sm border border-slate-200 dark:border-slate-700/80 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>New Folder</span>
              </button>
              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Document</span>
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center gap-4 shadow-sm">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">My Documents</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.totalDocuments}</p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center gap-4 shadow-sm">
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Folder className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">My Folders</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.totalFolders}</p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-center gap-4 shadow-sm">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">AI Summaries</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.aiSummaries}</p>
              </div>
            </div>
          </div>

          {/* Recent Documents Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                <span>Recent Documents</span>
              </h2>
              <Link
                href="/documents"
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 transition-colors"
              >
                <span>View all ({stats.totalDocuments})</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {recentDocuments.length === 0 ? (
              <div className="p-8 rounded-3xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-center space-y-3 shadow-sm">
                <FileText className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No documents uploaded yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Upload your medical reports, passports, or certificates to get started.
                </p>
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload First Document</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {recentDocuments.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-800/80 hover:border-amber-500/40 transition-all group flex flex-col justify-between shadow-sm"
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
                        {doc.aiProcessing?.status === "FAILED" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-medium border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" /> AI Failed
                          </span>
                        )}
                      </div>

                      <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-white truncate mb-1">
                        {doc.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate mb-3">
                        📁 {doc.folder?.name}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500">
                      <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                      <span>{Math.round(doc.sizeBytes / 1024)} KB</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* My Folders Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Folder className="w-5 h-5 text-blue-500" />
                <span>My Folders</span>
              </h2>
              <Link
                href="/folders"
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 transition-colors"
              >
                <span>View all folders</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {myFolders.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">No folders created yet.</p>
                <button
                  onClick={() => setIsCreateFolderOpen(true)}
                  className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  + Create folder
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {myFolders.map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/folders/${folder.id}`}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-800/80 hover:border-amber-500/40 transition-all flex items-center gap-3.5 group shadow-sm"
                  >
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-white truncate">
                        {folder.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {folder._count?.documents || 0} files &bull; {folder._count?.children || 0} subfolders
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Shared With Me Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-500" />
                <span>Shared With Me</span>
              </h2>
              <Link
                href="/shared"
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 transition-colors"
              >
                <span>View shared</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {sharedFolders.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-center text-xs text-slate-500">
                No folders have been shared with you yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {sharedFolders.map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/folders/${folder.id}`}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-slate-200 dark:border-slate-800/80 hover:border-emerald-500/40 transition-all flex items-center gap-3.5 group shadow-sm"
                  >
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-white truncate">
                        {folder.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Owner: {folder.owner?.name || folder.owner?.email} (Read Only)
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      <MobileNav onOpenUpload={() => setIsUploadOpen(true)} />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={refreshData}
      />

      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        onFolderCreated={refreshData}
      />
    </div>
  );
}

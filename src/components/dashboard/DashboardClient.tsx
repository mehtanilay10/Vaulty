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
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col transition-colors">
      <Navbar onOpenUpload={() => setIsUploadOpen(true)} onToggleSidebar={() => {}} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 pb-24 md:pb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 vault-card p-6 md:p-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-text-primary">
                Welcome back, {user?.name?.split(" ")[0] || "User"}
              </h1>
              <p className="text-text-secondary text-sm mt-1 font-light">
                Your private document vault is secured and up to date.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCreateFolderOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl vault-btn-secondary text-sm cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 text-accent-primary" />
                <span>New Folder</span>
              </button>
              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl vault-btn-primary text-sm cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Document</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="vault-card vault-card-hover p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent-primary-soft text-accent-primary">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium">My Documents</p>
                <p className="text-2xl font-bold text-text-primary mt-0.5">{stats.totalDocuments}</p>
              </div>
            </div>

            <div className="vault-card vault-card-hover p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent-primary-soft text-accent-primary">
                <Folder className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium">My Folders</p>
                <p className="text-2xl font-bold text-text-primary mt-0.5">{stats.totalFolders}</p>
              </div>
            </div>

            <div className="vault-card vault-card-hover p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent-emerald-soft text-accent-emerald">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium">AI Summaries</p>
                <p className="text-2xl font-bold text-text-primary mt-0.5">{stats.aiSummaries}</p>
              </div>
            </div>
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent-primary" />
                <span>Recent Documents</span>
              </h2>
              <Link
                href="/documents"
                className="text-xs font-semibold text-accent-primary hover:underline flex items-center gap-1 transition-colors"
              >
                <span>View all ({stats.totalDocuments})</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {recentDocuments.length === 0 ? (
              <div className="vault-card p-8 text-center space-y-3">
                <FileText className="w-10 h-10 text-text-muted mx-auto" />
                <p className="text-sm font-semibold text-text-secondary">No documents uploaded yet</p>
                <p className="text-xs text-text-muted max-w-sm mx-auto">
                  Upload your medical reports, passports, or certificates to get started.
                </p>
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="px-4 py-2 rounded-xl bg-accent-primary text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
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
                    className="vault-card vault-card-hover p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="p-2.5 rounded-xl bg-accent-primary-soft text-accent-primary group-hover:scale-105 transition-transform">
                          <FileText className="w-5 h-5" />
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
                        {doc.aiProcessing?.status === "FAILED" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-rose-soft text-accent-rose text-[10px] font-medium border border-accent-rose/20">
                            <AlertTriangle className="w-3 h-3" /> AI Failed
                          </span>
                        )}
                      </div>

                      <h3 className="font-semibold text-sm text-text-primary truncate mb-1">
                        {doc.name}
                      </h3>
                      <p className="text-xs text-text-muted truncate mb-3">
                        📁 {doc.folder?.name}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px] text-text-muted">
                      <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                      <span>{Math.round(doc.sizeBytes / 1024)} KB</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Folder className="w-5 h-5 text-accent-primary" />
                <span>My Folders</span>
              </h2>
              <Link
                href="/folders"
                className="text-xs font-semibold text-accent-primary hover:underline flex items-center gap-1 transition-colors"
              >
                <span>View all folders</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {myFolders.length === 0 ? (
              <div className="vault-card p-6 text-center">
                <p className="text-xs text-text-muted">No folders created yet.</p>
                <button
                  onClick={() => setIsCreateFolderOpen(true)}
                  className="mt-2 text-xs font-semibold text-accent-primary hover:underline cursor-pointer"
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
                    className="vault-card vault-card-hover p-4 flex items-center gap-3.5"
                  >
                    <div className="p-2.5 rounded-xl bg-accent-primary-soft text-accent-primary group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h3 className="font-semibold text-sm text-text-primary truncate">
                        {folder.name}
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5">
                        {folder._count?.documents || 0} files &bull; {folder._count?.children || 0} subfolders
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Users className="w-5 h-5 text-accent-emerald" />
                <span>Shared With Me</span>
              </h2>
              <Link
                href="/shared"
                className="text-xs font-semibold text-accent-primary hover:underline flex items-center gap-1 transition-colors"
              >
                <span>View shared</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {sharedFolders.length === 0 ? (
              <div className="vault-card p-6 text-center text-xs text-text-muted">
                No folders have been shared with you yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {sharedFolders.map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/folders/${folder.id}`}
                    className="vault-card vault-card-hover p-4 flex items-center gap-3.5"
                  >
                    <div className="p-2.5 rounded-xl bg-accent-emerald-soft text-accent-emerald">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h3 className="font-semibold text-sm text-text-primary truncate">
                        {folder.name}
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5">
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

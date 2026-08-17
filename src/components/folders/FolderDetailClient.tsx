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
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col transition-colors">
      <Navbar onOpenUpload={isOwner ? () => setIsUploadOpen(true) : undefined} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <nav className="flex items-center gap-2 text-xs text-text-muted overflow-x-auto py-1">
            <Link href="/folders" className="hover:text-text-primary transition-colors">
              Folders
            </Link>
            {breadcrumbs.map((b, idx) => (
              <div key={b.id} className="flex items-center gap-2 shrink-0">
                <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                {idx === breadcrumbs.length - 1 ? (
                  <span className="font-bold text-accent-primary">{b.name}</span>
                ) : (
                  <Link href={`/folders/${b.id}`} className="hover:text-text-primary transition-colors">
                    {b.name}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          <div className="vault-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3.5 rounded-2xl bg-accent-primary-soft text-accent-primary">
                  <Folder className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-text-primary tracking-tight">{folder.name}</h1>
                    {!isOwner && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent-primary-soft text-accent-primary text-xs font-semibold border border-accent-primary/20">
                        <Lock className="w-3 h-3" /> Shared Read Only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    Owner: {folder.owner?.name || folder.owner?.email} &bull; {folder.documents?.length || 0} files &bull; {folder.children?.length || 0} subfolders
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPropertiesOpen(true)}
                  className="p-2.5 rounded-xl vault-btn-secondary cursor-pointer"
                  title="Folder Properties & Sharing"
                >
                  <Settings className="w-4 h-4" />
                </button>

                {isOwner && (
                  <>
                    <button
                      onClick={() => setIsCreateSubfolderOpen(true)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl vault-btn-secondary text-xs cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4 text-accent-primary" />
                      <span>New Subfolder</span>
                    </button>
                    <button
                      onClick={() => setIsUploadOpen(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl vault-btn-primary text-xs cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload File</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {folder.children?.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary">Subfolders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {folder.children.map((sub: any) => (
                  <Link
                    key={sub.id}
                    href={`/folders/${sub.id}`}
                    className="vault-card vault-card-hover p-4 flex items-center gap-3"
                  >
                    <div className="p-2 rounded-xl bg-accent-primary-soft text-accent-primary">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h3 className="font-semibold text-sm text-text-primary truncate">
                        {sub.name}
                      </h3>
                      <p className="text-[11px] text-text-muted">
                        {sub._count?.documents || 0} files
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text-secondary">
              Documents in this folder ({folder.documents?.length || 0})
            </h2>

            {folder.documents?.length === 0 ? (
              <div className="vault-card p-10 text-center space-y-2">
                <FileText className="w-10 h-10 text-text-muted mx-auto" />
                <p className="text-sm font-semibold text-text-secondary">This folder is empty</p>
                {isOwner && (
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="px-4 py-2 rounded-xl bg-accent-primary text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
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
                    className="vault-card vault-card-hover p-5 flex flex-col justify-between"
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
                      </div>

                      <h3 className="font-semibold text-sm text-text-primary truncate mb-2">
                        {doc.name}
                      </h3>

                      {doc.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
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

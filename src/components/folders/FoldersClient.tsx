"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { CreateFolderModal } from "@/components/folders/CreateFolderModal";
import { UploadModal } from "@/components/documents/UploadModal";
import { Folder, FolderPlus, Upload, ChevronRight, Users } from "lucide-react";
import { useRouter } from "next/navigation";

export function FoldersClient({ initialFolders }: { initialFolders: any[] }) {
  const router = useRouter();
  const [folders, setFolders] = useState(initialFolders);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar onOpenUpload={() => setIsUploadOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Folder className="w-7 h-7 text-blue-400" />
                <span>My Folders</span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Root folder hierarchy in your vault ({folders.length})
              </p>
            </div>

            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-md shadow-indigo-600/20 transition-all cursor-pointer w-fit"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Folder</span>
            </button>
          </div>

          {folders.length === 0 ? (
            <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800/80 text-center space-y-3">
              <Folder className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-semibold text-slate-300">No folders created yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Create custom folders like Medical, Government, Education, or Financial to organize files.
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Create Root Folder</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {folders.map((folder) => (
                <Link
                  key={folder.id}
                  href={`/folders/${folder.id}`}
                  className="p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-800/70 border border-slate-800/80 hover:border-indigo-500/40 transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform">
                        <Folder className="w-6 h-6" />
                      </div>
                      {folder.shares?.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                          <Users className="w-3 h-3" /> Shared ({folder.shares.length})
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-base text-slate-200 group-hover:text-white truncate mb-1">
                      {folder.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {folder._count?.documents || 0} documents &bull; {folder._count?.children || 0} subfolders
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-indigo-400 group-hover:text-indigo-300 font-medium">
                    <span>Open folder</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>

      <MobileNav onOpenUpload={() => setIsUploadOpen(true)} />

      <CreateFolderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onFolderCreated={() => router.refresh()}
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => router.refresh()}
      />
    </div>
  );
}

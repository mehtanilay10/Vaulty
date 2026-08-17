"use client";

import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Users, Folder, ChevronRight, Lock } from "lucide-react";

export function SharedClient({ sharedFolders }: { sharedFolders: any[] }) {
  return (
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col transition-colors">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <Users className="w-7 h-7 text-accent-emerald" />
              <span>Shared With Me</span>
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Folders shared with you by family members and registered users ({sharedFolders.length})
            </p>
          </div>

          {sharedFolders.length === 0 ? (
            <div className="vault-card p-12 text-center space-y-3">
              <Users className="w-12 h-12 text-text-muted mx-auto" />
              <h3 className="text-base font-semibold text-text-secondary">No shared folders</h3>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                When another Vaulty user shares a folder with your email, it will appear here with read-only access.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sharedFolders.map((folder) => (
                <Link
                  key={folder.id}
                  href={`/folders/${folder.id}`}
                  className="vault-card vault-card-hover p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 rounded-xl bg-accent-emerald-soft text-accent-emerald group-hover:scale-105 transition-transform">
                        <Folder className="w-6 h-6" />
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-bg-muted text-text-secondary text-[10px] font-semibold uppercase border border-border-subtle">
                        <Lock className="w-3 h-3" /> Read Only
                      </span>
                    </div>

                    <h3 className="font-semibold text-base text-text-primary truncate mb-1">
                      {folder.name}
                    </h3>
                    <p className="text-xs text-text-muted truncate mb-1">
                      Owner: {folder.owner?.name || folder.owner?.email}
                    </p>
                    <p className="text-xs text-text-muted">
                      {folder._count?.documents || 0} files &bull; {folder._count?.children || 0} subfolders
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-border-subtle flex items-center justify-between text-xs text-accent-emerald font-medium">
                    <span>Browse shared folder</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

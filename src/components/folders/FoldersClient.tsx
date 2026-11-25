"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton } from "@/components/ui/CommandBar";
import { CreateFolderModal } from "@/components/folders/CreateFolderModal";
import { UploadModal } from "@/components/documents/UploadModal";
import { useUpload } from "@/app/contexts/UploadContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Folder, FolderPlus, ChevronRight, Users, FileText, Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";
import type { FolderWithCounts } from "@/types";

export function FoldersClient({ initialFolders }: { initialFolders: FolderWithCounts[] }) {
  const router = useRouter();
  const [folders, setFolders] = useState(initialFolders);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { closeUpload, isOpen: isUploadOpen } = useUpload();
  const { isConnected } = useGoogleDriveStatus();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalDocuments = folders.reduce((sum, f) => sum + (f._count?.documents || 0), 0);
  const totalChildren = folders.reduce((sum, f) => sum + (f._count?.children || 0), 0);

  return (
    <>
      <div className="space-y-3">
        <PageHeader title="My Folders" icon={<Folder className="h-5 w-5" />} />

        <CommandBar>
          <CommandBarButton
            primary
            icon={<FolderPlus className="h-3.5 w-3.5 text-white" />}
            onClick={() => setIsCreateOpen(true)}
            disabled={!isConnected}
          >
            Create folder
          </CommandBarButton>
        </CommandBar>
      </div>

      <section className="space-y-3">
        <SectionHeader
          icon={<Layers className="h-4 w-4" />}
          title="Root folders"
          description="Top-level categories used to organise your documents."
          count={folders.length}
          action={
            folders.length > 0 ? (
              <div className="flex items-center gap-3 text-[11px] font-medium text-text-muted">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {totalDocuments} files
                </span>
                <span className="flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5" />
                  {totalChildren} subfolders
                </span>
              </div>
            ) : undefined
          }
        />

        {folders.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<Folder className="h-6 w-6" />}
              title="No folders created yet"
              description="Create custom folders like Medical, Government, Education, or Financial to organize files."
              action={
                <Button onClick={() => setIsCreateOpen(true)} disabled={!isConnected}>
                  <FolderPlus className="h-4 w-4" />
                  Create root folder
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((folder) => (
              <Link
                key={folder.id}
                href={`/folders/${folder.id}`}
                className="card card-hover flex flex-col justify-between p-4"
              >
                <div>
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand">
                      <Folder className="h-5 w-5" />
                    </div>
                    {(folder.shares?.length ?? 0) > 0 && (
                      <Badge variant="info">
                        <Users className="h-3 w-3" />
                        Shared ({folder.shares?.length ?? 0})
                      </Badge>
                    )}
                  </div>

                  <h3 className="mb-1 truncate text-[13px] font-semibold text-text-primary">
                    {folder.name}
                  </h3>
                  <p className="text-[11px] text-text-muted">
                    {folder._count?.documents || 0} documents &bull; {folder._count?.children || 0}{" "}
                    subfolders
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11px] font-semibold text-brand">
                  <span>Open folder</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <CreateFolderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onFolderCreated={() => router.refresh()}
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={closeUpload}
        onUploadSuccess={() => router.refresh()}
      />
    </>
  );
}

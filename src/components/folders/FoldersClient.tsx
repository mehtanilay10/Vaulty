"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { MobileNav } from "@/components/shell/MobileNav";
import { PageHeader } from "@/components/shell/PageHeader";
import { CreateFolderModal } from "@/components/folders/CreateFolderModal";
import { UploadModal } from "@/components/documents/UploadModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Folder,
  FolderPlus,
  Upload,
  ChevronRight,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";

export function FoldersClient({ initialFolders }: { initialFolders: any[] }) {
  const router = useRouter();
  const [folders, setFolders] = useState(initialFolders);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { isConnected } = useGoogleDriveStatus();

  useEffect(() => {
    setFolders(initialFolders);
  }, [initialFolders]);

  return (
    <AppShell onOpenUpload={() => setIsUploadOpen(true)}>
      <PageHeader
        title="My Folders"
        description={`Root folder hierarchy in your vault (${folders.length})`}
        icon={<Folder className="w-7 h-7" />}
        actions={
          <Button onClick={() => setIsCreateOpen(true)} disabled={!isConnected}>
            <FolderPlus className="w-4 h-4" />
            Create Folder
          </Button>
        }
      />

      {folders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Folder className="w-12 h-12" />}
            title="No folders created yet"
            description="Create custom folders like Medical, Government, Education, or Financial to organize files."
            action={
              <Button onClick={() => setIsCreateOpen(true)} disabled={!isConnected}>
                <FolderPlus className="w-4 h-4" />
                Create Root Folder
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {folders.map((folder) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className="card card-hover p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg bg-brand-subtle text-brand">
                    <Folder className="w-5 h-5" />
                  </div>
                  {folder.shares?.length > 0 && (
                    <Badge variant="info" className="text-[10px]">
                      <Users className="w-3 h-3" /> Shared ({folder.shares.length})
                    </Badge>
                  )}
                </div>

                <h3 className="font-semibold text-base text-text-primary truncate mb-1">
                  {folder.name}
                </h3>
                <p className="text-xs text-text-muted">
                  {folder._count?.documents || 0} documents &bull; {folder._count?.children || 0} subfolders
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-border-subtle flex items-center justify-between text-xs text-brand font-medium">
                <span>Open folder</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      )}

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
    </AppShell>
  );
}

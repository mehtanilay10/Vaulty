"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { CreateFolderModal } from "@/components/folders/CreateFolderModal";
import { UploadModal } from "@/components/documents/UploadModal";
import { FolderPropertiesModal } from "@/components/folders/FolderPropertiesModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Folder,
  FileText,
  ChevronRight,
  FolderPlus,
  Upload,
  Settings,
  Users,
  Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";

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
  const { isConnected } = useGoogleDriveStatus();

  const refreshData = () => {
    router.refresh();
  };

  return (
    <AppShell onOpenUpload={isOwner ? () => setIsUploadOpen(true) : undefined}>
      <nav className="flex items-center gap-2 text-xs text-text-muted overflow-x-auto py-1">
        <Link href="/folders" className="hover:text-text-primary transition-colors">
          Folders
        </Link>
        {breadcrumbs.map((b, idx) => (
          <div key={b.id} className="flex items-center gap-2 shrink-0">
            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
            {idx === breadcrumbs.length - 1 ? (
              <span className="font-semibold text-brand">{b.name}</span>
            ) : (
              <Link href={`/folders/${b.id}`} className="hover:text-text-primary transition-colors">
                {b.name}
              </Link>
            )}
          </div>
        ))}
      </nav>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3.5 rounded-lg bg-brand-subtle text-brand">
              <Folder className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-text-primary tracking-tight">{folder.name}</h1>
                {!isOwner && (
                  <Badge variant="info" className="text-xs">
                    <Lock className="w-3 h-3" /> Shared Read Only
                  </Badge>
                )}
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Owner: {folder.owner?.name || folder.owner?.email} • {folder.documents?.length || 0} files • {folder.children?.length || 0} subfolders
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPropertiesOpen(true)}
              className="p-2.5 rounded-md btn-ghost cursor-pointer"
              title="Folder Properties & Sharing"
            >
              <Settings className="w-4 h-4" />
            </button>

            {isOwner && isConnected && (
              <>
                <Button variant="secondary" onClick={() => setIsCreateSubfolderOpen(true)}>
                  <FolderPlus className="w-4 h-4 text-brand" />
                  New Subfolder
                </Button>
                <Button onClick={() => setIsUploadOpen(true)}>
                  <Upload className="w-4 h-4" />
                  Upload File
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {folder.children?.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-secondary">Subfolders</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {folder.children.map((sub: any) => (
              <Link
                key={sub.id}
                href={`/folders/${sub.id}`}
                className="card card-hover p-4 flex items-center gap-3"
              >
                <div className="p-2 rounded-lg bg-brand-subtle text-brand">
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
          <Card>
            <EmptyState
              icon={<FileText className="w-10 h-10" />}
              title="This folder is empty"
              action={
                isOwner && isConnected && (
                  <Button onClick={() => setIsUploadOpen(true)}>
                    <Upload className="w-4 h-4" />
                    Upload Document to {folder.name}
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {folder.documents.map((doc: any) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="card card-hover p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="p-2.5 rounded-lg bg-brand-subtle text-brand">
                      <FileText className="w-5 h-5" />
                    </div>
                    {doc.aiProcessing?.status === "COMPLETED" && (
                      <Badge variant="success" className="text-[10px]">AI Ready</Badge>
                    )}
                    {doc.aiProcessing?.status === "PROCESSING" && (
                      <Badge variant="warning" className="text-[10px]">Processing</Badge>
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
                          className="px-2 py-0.5 rounded-md bg-surface-muted text-text-secondary text-[10px] font-medium"
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
    </AppShell>
  );
}

/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/shell/PageHeader";
import { useUpload } from "@/app/contexts/UploadContext";

const CreateFolderModal = dynamic(
  () => import("@/components/folders/CreateFolderModal").then((mod) => mod.CreateFolderModal),
  { ssr: false },
);
const UploadModal = dynamic(
  () => import("@/components/documents/UploadModal").then((mod) => mod.UploadModal),
  { ssr: false },
);
const FolderPropertiesModal = dynamic(
  () =>
    import("@/components/folders/FolderPropertiesModal").then((mod) => mod.FolderPropertiesModal),
  { ssr: false },
);
const DocumentQA = dynamic(
  () => import("@/components/documents/DocumentQA").then((mod) => mod.DocumentQA),
  { ssr: false },
);
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AiStatusBadge } from "@/components/ui/AiStatusBadge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  Folder,
  FileText,
  ChevronRight,
  FolderPlus,
  Upload,
  Settings,
  Lock,
  Layers,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";
import type { FolderWithCounts } from "@/types";

export function FolderDetailClient({
  folder,
  breadcrumbs,
  isOwner,
}: {
  folder: FolderWithCounts;
  breadcrumbs: { id: string; name: string }[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [isCreateSubfolderOpen, setIsCreateSubfolderOpen] = useState(false);
  const { openUpload, closeUpload, isOpen: isUploadOpen } = useUpload();
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isQaOpen, setIsQaOpen] = useState(false);
  const { isConnected } = useGoogleDriveStatus();

  const canAskAi = (folder.children?.length || 0) === 0 && (folder.documents?.length || 0) > 0;

  const refreshData = () => {
    router.refresh();
  };

  const isFamily = !isOwner;
  const owner = folder.owner;

  const crumbItems = isFamily
    ? [
        { label: "Family", href: "/family" },
        {
          label: owner?.name || owner?.email || "Family member",
          href: `/family/${owner?.id}/documents`,
        },
        { label: "Documents", href: `/family/${owner?.id}/documents` },
        ...breadcrumbs.map((crumb, index) => ({
          label: crumb.name,
          href: index === breadcrumbs.length - 1 ? undefined : `/folders/${crumb.id}`,
        })),
      ]
    : [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Documents", href: "/documents" },
        { label: "Folders", href: "/folders" },
        ...breadcrumbs.map((crumb, index) => ({
          label: crumb.name,
          href: index === breadcrumbs.length - 1 ? undefined : `/folders/${crumb.id}`,
        })),
      ];

  return (
    <>
      <div className="space-y-3">
        <Breadcrumbs items={crumbItems} />

        <PageHeader
          eyebrow="Folder"
          title={folder.name}
          description={`Owner: ${folder.owner?.name || folder.owner?.email} · ${folder.documents?.length || 0} files · ${folder.children?.length || 0} subfolders`}
          icon={<Folder className="h-5 w-5" />}
          actions={
            <>
              {!isOwner && (
                <Badge variant="info">
                  <Lock className="h-3 w-3" />
                  Shared read only
                </Badge>
              )}
              <Button
                variant="ghost"
                onClick={() => setIsPropertiesOpen(true)}
                aria-label="Folder properties and sharing"
                title="Folder properties & sharing"
                className="px-2"
              >
                <Settings className="h-4 w-4" />
              </Button>

              {canAskAi && (
                <Button
                  variant="secondary"
                  onClick={() => setIsQaOpen(true)}
                  aria-label="Ask AI about folder documents"
                  title="Ask AI about folder documents"
                >
                  <Sparkles className="h-4 w-4 text-brand" />
                  Ask AI
                </Button>
              )}

              {isOwner && isConnected && (
                <>
                  <Button variant="secondary" onClick={() => setIsCreateSubfolderOpen(true)}>
                    <FolderPlus className="h-4 w-4" />
                    New subfolder
                  </Button>
                  <Button onClick={openUpload}>
                    <Upload className="h-4 w-4" />
                    Upload file
                  </Button>
                </>
              )}
            </>
          }
        />
      </div>

      {folder.children && folder.children.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            icon={<Layers className="h-4 w-4" />}
            title="Subfolders"
            description="Nested folders inside this location."
            count={folder.children.length}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {folder.children.map((sub) => (
              <Link
                key={sub.id}
                href={`/folders/${sub.id}`}
                className="card card-hover group flex items-center gap-3 p-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand">
                  <Folder className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[13px] font-semibold text-text-primary">
                    {sub.name}
                  </h3>
                  <p className="text-[11px] text-text-muted">{sub._count?.documents || 0} files</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader
          icon={<FileText className="h-4 w-4" />}
          title="Documents in this folder"
          description="Files stored directly inside this folder."
          count={folder.documents?.length || 0}
        />

        {folder.documents?.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="This folder is empty"
              description="Upload a document to start filling this folder."
              action={
                isOwner && isConnected ? (
                  <Button onClick={openUpload}>
                    <Upload className="h-4 w-4" />
                    Upload document to {folder.name}
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(folder.documents ?? []).map((doc) => (
              <Link
                key={doc.id}
                href={
                  isFamily && owner?.id
                    ? `/family/${owner.id}/documents/${doc.id}`
                    : `/documents/${doc.id}`
                }
                className="card card-hover flex flex-col justify-between p-4"
              >
                <div>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    {doc.thumbnailUrl ? (
                      <img
                        src={doc.thumbnailUrl}
                        alt=""
                        className="h-10 w-10 rounded-md border border-border-subtle object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand">
                        <FileText className="h-5 w-5" />
                      </div>
                    )}
                    <AiStatusBadge
                      status={doc.aiProcessing?.status}
                      createdAt={doc.aiProcessing?.createdAt}
                    />
                  </div>

                  <h3 className="mb-1 truncate text-[13px] font-semibold text-text-primary">
                    {doc.name}
                  </h3>

                  {doc.tags?.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {doc.tags.map((t) => (
                        <span
                          key={t.tag.id}
                          className="rounded border border-border-subtle bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-secondary"
                        >
                          #{t.tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11px] text-text-muted">
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
        onClose={closeUpload}
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

      {canAskAi && (
        <DocumentQA
          folderId={folder.id}
          folderName={folder.name}
          isOpen={isQaOpen}
          onClose={() => setIsQaOpen(false)}
        />
      )}
    </>
  );
}

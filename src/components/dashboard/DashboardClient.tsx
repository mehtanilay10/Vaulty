"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { UploadModal } from "@/components/documents/UploadModal";
import { CreateFolderModal } from "@/components/folders/CreateFolderModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Folder,
  FileText,
  Users,
  Upload,
  FolderPlus,
  Sparkles,
  ChevronRight,
  Clock,
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
    <AppShell onOpenUpload={() => setIsUploadOpen(true)}>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] || "User"}`}
        description="Your private document vault is secured and up to date."
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsCreateFolderOpen(true)}>
              <FolderPlus className="w-4 h-4" />
              New Folder
            </Button>
            <Button onClick={() => setIsUploadOpen(true)}>
              <Upload className="w-4 h-4" />
              Upload Document
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-brand-subtle text-brand">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">My Documents</p>
            <p className="text-2xl font-bold text-text-primary mt-0.5">{stats.totalDocuments}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-brand-subtle text-brand">
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">My Folders</p>
            <p className="text-2xl font-bold text-text-primary mt-0.5">{stats.totalFolders}</p>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-success-subtle text-success">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">AI Summaries</p>
            <p className="text-2xl font-bold text-text-primary mt-0.5">{stats.aiSummaries}</p>
          </div>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand" />
            <span>Recent Documents</span>
          </h2>
          <Link
            href="/documents"
            className="text-xs font-semibold text-brand hover:underline flex items-center gap-1"
          >
            <span>View all ({stats.totalDocuments})</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {recentDocuments.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-10 h-10" />}
            title="No documents uploaded yet"
            description="Upload your medical reports, passports, or certificates to get started."
            action={
              <Button onClick={() => setIsUploadOpen(true)}>
                <Upload className="w-4 h-4" />
                Upload First Document
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentDocuments.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="card card-hover p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="p-2.5 rounded-lg bg-brand-subtle text-brand">
                      <FileText className="w-5 h-5" />
                    </div>
                    {doc.aiProcessing?.status === "COMPLETED" && (
                      <Badge variant="success">AI Ready</Badge>
                    )}
                    {doc.aiProcessing?.status === "PROCESSING" && (
                      <Badge variant="warning">Processing</Badge>
                    )}
                    {doc.aiProcessing?.status === "FAILED" && (
                      <Badge variant="danger">AI Failed</Badge>
                    )}
                  </div>

                  <h3 className="font-semibold text-sm text-text-primary truncate mb-1">
                    {doc.name}
                  </h3>
                  <p className="text-xs text-text-muted truncate mb-3">
                    {doc.folder?.name}
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
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Folder className="w-5 h-5 text-brand" />
            <span>My Folders</span>
          </h2>
          <Link
            href="/folders"
            className="text-xs font-semibold text-brand hover:underline flex items-center gap-1"
          >
            <span>View all folders</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {myFolders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Folder className="w-10 h-10" />}
              title="No folders created yet"
              description="Create custom folders like Medical, Government, Education, or Financial to organize files."
              action={
                <Button onClick={() => setIsCreateFolderOpen(true)}>
                  <FolderPlus className="w-4 h-4" />
                  Create Root Folder
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {myFolders.map((folder) => (
              <Link
                key={folder.id}
                href={`/folders/${folder.id}`}
                className="card card-hover p-4 flex items-center gap-3.5"
              >
                <div className="p-2.5 rounded-lg bg-brand-subtle text-brand">
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
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-success" />
            <span>Shared With Me</span>
          </h2>
          <Link
            href="/shared"
            className="text-xs font-semibold text-brand hover:underline flex items-center gap-1"
          >
            <span>View shared</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {sharedFolders.length === 0 ? (
          <Card>
            <p className="text-xs text-text-muted text-center py-6">No folders have been shared with you yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {sharedFolders.map((folder) => (
              <Link
                key={folder.id}
                href={`/folders/${folder.id}`}
                className="card card-hover p-4 flex items-center gap-3.5"
              >
                <div className="p-2.5 rounded-lg bg-success-subtle text-success">
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
    </AppShell>
  );
}

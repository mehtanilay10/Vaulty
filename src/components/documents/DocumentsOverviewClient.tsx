/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/shell/PageHeader";
import { useUpload } from "@/app/contexts/UploadContext";

const UploadModal = dynamic(
  () => import("@/components/documents/UploadModal").then((mod) => mod.UploadModal),
  { ssr: false },
);
const CreateFolderModal = dynamic(
  () => import("@/components/folders/CreateFolderModal").then((mod) => mod.CreateFolderModal),
  { ssr: false },
);
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AiStatusBadge } from "@/components/ui/AiStatusBadge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatCard } from "@/components/ui/StatCard";
import {
  Folder,
  FileText,
  Users,
  Upload,
  FolderPlus,
  Sparkles,
  ChevronRight,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Cloud,
  Camera,
} from "lucide-react";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";
import type { DocumentWithRelations, FolderWithCounts } from "@/types";

export function DocumentsOverviewClient({
  recentDocuments,
  myFolders,
  sharedFolders,
  expiringDocuments = [],
  stats,
  initialDriveConnected = false,
}: {
  recentDocuments: DocumentWithRelations[];
  myFolders: FolderWithCounts[];
  sharedFolders: FolderWithCounts[];
  expiringDocuments?: {
    id: string;
    name: string;
    expiryDate: string | null;
    folder?: { id: string; name: string } | null;
  }[];
  stats: { totalDocuments: number; totalFolders: number; aiSummaries: number };
  initialDriveConnected?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openUpload, closeUpload, isOpen: isUploadOpen, openCamera } = useUpload();
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const { isConnected: liveIsConnected, loading: driveLoading } = useGoogleDriveStatus();
  const isConnected = liveIsConnected || initialDriveConnected;

  useEffect(() => {
    if (searchParams.get("upload") === "true" || searchParams.get("action") === "upload") {
      openUpload();
    }
  }, [searchParams, openUpload]);

  const refreshData = () => {
    router.refresh();
  };

  const getUrgency = (expiryDate: string | null) => {
    if (!expiryDate) return { label: "Unknown", variant: "default" as const };
    try {
      const now = new Date();
      const expiry = new Date(expiryDate);
      if (isNaN(expiry.getTime())) return { label: "Unknown", variant: "default" as const };
      const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return { label: "Expired", variant: "danger" as const };
      if (diffDays <= 14) return { label: `${diffDays}d left`, variant: "danger" as const };
      if (diffDays <= 30) return { label: `${diffDays}d left`, variant: "warning" as const };
      return { label: `${diffDays}d left`, variant: "success" as const };
    } catch {
      return { label: "Unknown", variant: "default" as const };
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Document vault"
        title="Documents"
        description="Your private document library — upload, organize, and track expiries."
        icon={<FileText className="h-5 w-5" />}
        actions={
          <>
            <Link
              href="/documents/library"
              className="btn btn-secondary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
            >
              <FileText className="h-4 w-4" />
              Browse all
            </Link>
            <Button
              variant="secondary"
              onClick={() => setIsCreateFolderOpen(true)}
              disabled={!isConnected}
            >
              <FolderPlus className="h-4 w-4" />
              New folder
            </Button>
            <Button variant="secondary" onClick={() => openCamera()} disabled={!isConnected}>
              <Camera className="h-4 w-4" />
              Scan document
            </Button>
            <Button onClick={openUpload} disabled={!isConnected}>
              <Upload className="h-4 w-4" />
              Upload document
            </Button>
          </>
        }
      />

      {!isConnected && !driveLoading && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-subtle/20 px-4 py-3 text-text-primary">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <Cloud className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-primary">Google Drive is not connected</p>
            <p className="text-xs text-text-muted mt-0.5">
              Connect your Google Drive in Settings to enable document uploads, cloud storage sync,
              and AI extraction.
            </p>
          </div>
          <Link href="/settings">
            <Button size="sm" variant="secondary" className="shrink-0 gap-1.5">
              <Cloud className="h-4 w-4" />
              Connect
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Documents secured"
          value={stats.totalDocuments}
          icon={<FileText className="h-4 w-4" />}
          hint="Private"
          href="/documents/library"
        />
        <StatCard
          label="Folders organized"
          value={stats.totalFolders}
          icon={<Folder className="h-4 w-4" />}
          tone="info"
          href="/folders"
        />
        <StatCard
          label="AI summaries ready"
          value={stats.aiSummaries}
          icon={<Sparkles className="h-4 w-4" />}
          tone="success"
          hint="Gemini"
          href="/documents/library"
        />
      </div>

      {expiringDocuments.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            icon={<AlertTriangle className="h-4 w-4 text-warning" />}
            title="Expiring documents"
            description="Renew these documents before they expire."
            count={expiringDocuments.length}
            action={<Badge variant="warning">Needs attention</Badge>}
          />

          <Card className="overflow-hidden p-0">
            <div className="divide-y divide-border-subtle">
              {expiringDocuments.map((doc) => {
                const urgency = getUrgency(doc.expiryDate);
                return (
                  <Link
                    key={doc.id}
                    href={`/documents/${doc.id}`}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/70"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-warning/20 bg-warning-subtle text-warning">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text-primary">
                        {doc.name}
                      </p>
                      <p className="truncate text-[11px] text-text-muted">
                        {doc.folder?.name || "Unfiled"}
                        {doc.expiryDate
                          ? ` · Expires ${(() => {
                              try {
                                const d = new Date(doc.expiryDate);
                                return isNaN(d.getTime()) ? doc.expiryDate : d.toLocaleDateString();
                              } catch {
                                return doc.expiryDate;
                              }
                            })()}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant={urgency.variant}>{urgency.label}</Badge>
                    <ChevronRight className="hidden h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5 sm:block" />
                  </Link>
                );
              })}
            </div>
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader
          icon={<Clock className="h-4 w-4" />}
          title="Recent documents"
          description="The latest files added to your vault."
          count={stats.totalDocuments}
          action={
            <Link
              href="/documents/library"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              View all
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        />

        {recentDocuments.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="No documents uploaded yet"
              description="Upload your medical reports, passports, or certificates to get started."
              action={
                <Button onClick={openUpload} disabled={!isConnected}>
                  <Upload className="h-4 w-4" />
                  Upload first document
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {recentDocuments.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
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
                  <p className="truncate text-[11px] text-text-muted">{doc.folder?.name}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11px] text-text-muted">
                  <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  <span>{Math.round(doc.sizeBytes / 1024)} KB</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <SectionHeader
            icon={<Folder className="h-4 w-4" />}
            title="My folders"
            count={myFolders.length}
            action={
              <Link
                href="/folders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                View all
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />

          {myFolders.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Folder className="h-6 w-6" />}
                title="No folders created yet"
                description="Create custom folders like Medical, Government, Education, or Financial to organize files."
                action={
                  <Button onClick={() => setIsCreateFolderOpen(true)} disabled={!isConnected}>
                    <FolderPlus className="h-4 w-4" />
                    Create root folder
                  </Button>
                }
              />
            </Card>
          ) : (
            <Card padding="compact">
              <div className="space-y-0.5">
                {myFolders.slice(0, 6).map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/folders/${folder.id}`}
                    className="group flex items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand">
                      <Folder className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-semibold text-text-primary">
                        {folder.name}
                      </h3>
                      <p className="text-[11px] text-text-muted">
                        {folder._count?.documents || 0} files · {folder._count?.children || 0}{" "}
                        subfolders
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={<Users className="h-4 w-4 text-success" />}
            title="Shared with me"
            count={sharedFolders.length}
            action={
              <Link
                href="/shared"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                View shared
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />

          {sharedFolders.length === 0 ? (
            <Card className="flex min-h-[9rem] items-center justify-center p-5">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted text-text-muted">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <p className="text-xs text-text-muted">No folders have been shared with you yet.</p>
              </div>
            </Card>
          ) : (
            <Card padding="compact">
              <div className="space-y-0.5">
                {sharedFolders.slice(0, 6).map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/folders/${folder.id}`}
                    className="group flex items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-success/20 bg-success-subtle text-success">
                      <Folder className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-semibold text-text-primary">
                        {folder.name}
                      </h3>
                      <p className="truncate text-[11px] text-text-muted">
                        Owner: {folder.owner?.name || folder.owner?.email} · Read only
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </section>
      </div>

      <UploadModal isOpen={isUploadOpen} onClose={closeUpload} onUploadSuccess={refreshData} />

      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        onFolderCreated={refreshData}
      />
    </>
  );
}

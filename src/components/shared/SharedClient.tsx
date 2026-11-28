"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Users, Folder, ChevronRight, Lock, ShieldCheck } from "lucide-react";
import type { FolderWithCounts } from "@/types";

export function SharedClient({ sharedFolders }: { sharedFolders: FolderWithCounts[] }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Shared With Me" icon={<Users className="h-5 w-5 text-success" />} />

      <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info-subtle/40 px-4 py-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-xs leading-relaxed text-text-secondary">
          Shared folders are <span className="font-semibold text-text-primary">read-only</span> by
          default. You can browse and download their contents, but only the owner can add, edit, or
          remove files.
        </p>
      </div>

      <section className="space-y-3">
        <SectionHeader
          icon={<Folder className="h-4 w-4 text-success" />}
          title="Shared folders"
          description="Folders you have been invited to access."
          count={sharedFolders.length}
        />

        {sharedFolders.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No shared folders"
              description="When another Vaulty user shares a folder with your email, it will appear here with read-only access."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sharedFolders.map((folder) => (
              <Link
                key={folder.id}
                href={`/folders/${folder.id}`}
                className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface p-4 shadow-xs transition-all hover:border-border-strong hover:bg-surface-elevated hover:shadow-sm"
              >
                <div>
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-success/20 bg-success-subtle text-success">
                      <Folder className="h-5 w-5" />
                    </div>
                    <Badge variant="info">
                      <Lock className="h-3 w-3" />
                      Read only
                    </Badge>
                  </div>

                  <h3 className="mb-1 truncate text-[14px] font-semibold tracking-tight text-text-primary group-hover:text-brand">
                    {folder.name}
                  </h3>
                  <p className="mb-1 truncate text-[11px] text-text-muted">
                    Owner: {folder.owner?.name || folder.owner?.email}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-text-muted">
                    {folder._count?.documents || 0} files · {folder._count?.children || 0}{" "}
                    subfolders
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11px] font-semibold text-success">
                  <span>Browse shared folder</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

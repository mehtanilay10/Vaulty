"use client";

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users, Folder, ChevronRight, Lock } from "lucide-react";

export function SharedClient({ sharedFolders }: { sharedFolders: any[] }) {
  return (
    <AppShell>
      <PageHeader
        title="Shared With Me"
        description={`Folders shared with you by family members and registered users (${sharedFolders.length})`}
        icon={<Users className="w-7 h-7 text-success" />}
      />

      {sharedFolders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="w-12 h-12" />}
            title="No shared folders"
            description="When another Vaulty user shares a folder with your email, it will appear here with read-only access."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sharedFolders.map((folder) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className="card card-hover p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-lg bg-success-subtle text-success">
                    <Folder className="w-5 h-5" />
                  </div>
                  <Badge variant="info" className="text-[10px]">
                    <Lock className="w-3 h-3" /> Read Only
                  </Badge>
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

              <div className="pt-4 mt-4 border-t border-border-subtle flex items-center justify-between text-xs text-success font-medium">
                <span>Browse shared folder</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

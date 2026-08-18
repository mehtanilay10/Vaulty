"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { UploadModal } from "@/components/documents/UploadModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FileText,
  Search,
  Tag,
  Upload,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Folder,
  HardDrive,
} from "lucide-react";
import { useRouter } from "next/navigation";

export function DocumentsClient({
  initialDocuments,
  folders,
}: {
  initialDocuments: any[];
  folders: any[];
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [filterFolderId, setFilterFolderId] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const filteredDocs = documents.filter((doc) => {
    const matchesFolder = filterFolderId ? doc.folderId === filterFolderId : true;
    const matchesSearch = searchFilter
      ? doc.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        doc.tags.some((t: any) => t.tag.name.toLowerCase().includes(searchFilter.toLowerCase()))
      : true;
    return matchesFolder && matchesSearch;
  });

  return (
    <AppShell onOpenUpload={() => setIsUploadOpen(true)}>
      <PageHeader
        title="My Documents"
        description={`All private documents in your personal vault (${documents.length})`}
        icon={<FileText className="w-7 h-7" />}
        actions={
          <Button onClick={() => setIsUploadOpen(true)}>
            <Upload className="w-4 h-4" />
            Upload Document
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter by name or tag..."
              className="w-full pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={filterFolderId}
              onChange={(e) => setFilterFolderId(e.target.value)}
              className="w-full sm:w-56"
            >
              <option value="">All Folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {filteredDocs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText className="w-12 h-12" />}
            title="No documents found"
            description="No files matched your filters. Upload a document or clear your search criteria."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredDocs.map((doc) => (
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
                  {doc.storageProvider === "GOOGLE_DRIVE" && (
                    <Badge variant="info" className="text-[10px]">
                      Drive
                    </Badge>
                  )}
                </div>

                <h3 className="font-semibold text-sm text-text-primary truncate mb-1">
                  {doc.name}
                </h3>
                <p className="text-xs text-text-muted truncate mb-3">
                  {doc.folder?.name}
                </p>

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

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => router.refresh()}
      />
    </AppShell>
  );
}

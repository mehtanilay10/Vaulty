/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { UploadModal } from "@/components/documents/UploadModal";
import { useUpload } from "@/app/contexts/UploadContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { AiStatusBadge } from "@/components/ui/AiStatusBadge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  FileText,
  Search,
  Upload,
  X,
  Files,
  ArrowLeft,
  LayoutGrid,
  List,
  Sparkles,
  FileImage,
  File as FileIcon,
  Cloud,
  Download,
  Eye,
  Camera,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";
import type { DocumentWithRelations } from "@/types";

export function DocumentsClient({
  initialDocuments,
  folders,
  currentUserId,
  initialHasMore,
  initialTotal,
}: {
  initialDocuments: DocumentWithRelations[];
  folders: { id: string; name: string }[];
  currentUserId: string;
  initialHasMore: boolean;
  initialTotal: number;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [filterFolderId, setFilterFolderId] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const deferredSearchFilter = useDeferredValue(searchFilter);
  const [typeFilter, setTypeFilter] = useState("all");
  const [aiFilter, setAiFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const { openUpload, closeUpload, isOpen: isUploadOpen, openCamera } = useUpload();
  const searchParams = useSearchParams();
  const { isConnected } = useGoogleDriveStatus();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (searchParams.get("upload") === "true" || searchParams.get("action") === "upload") {
      openUpload();
    }
  }, [searchParams, openUpload]);

  const handleRetryAi = async (documentId: string) => {
    setRetryingId(documentId);
    try {
      await fetch(`/api/documents/${documentId}/ai`, { method: "POST", headers: csrfHeaders() });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setRetryingId(null);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      setDocuments(initialDocuments);
      setCurrentPage(1);
      setHasMore(initialHasMore);
      setTotalCount(initialTotal);
    });
  }, [initialDocuments, initialHasMore, initialTotal]);

  const buildQuery = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), limit: "50", sort: sortOrder });
      if (searchFilter.trim()) params.set("q", searchFilter.trim());
      if (typeFilter !== "all") params.set("fileType", typeFilter);
      if (aiFilter !== "all") params.set("aiStatus", aiFilter);
      if (filterFolderId) params.set("folderId", filterFolderId);
      return params.toString();
    },
    [sortOrder, searchFilter, typeFilter, aiFilter, filterFolderId],
  );

  useEffect(() => {
    const hasServerFilters = Boolean(
      searchFilter.trim() ||
      filterFolderId ||
      typeFilter !== "all" ||
      aiFilter !== "all" ||
      sortOrder !== "recent",
    );
    if (!hasServerFilters) {
      queueMicrotask(() => {
        setDocuments(initialDocuments);
        setCurrentPage(1);
        setHasMore(initialHasMore);
        setTotalCount(initialTotal);
        setLoadingResults(false);
      });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingResults(true);
      try {
        const response = await fetch(`/api/documents?${buildQuery(1)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to filter documents.");
        if (controller.signal.aborted) return;
        setDocuments(data.documents);
        setCurrentPage(1);
        setHasMore(data.pagination.hasMore);
        setTotalCount(data.pagination.total);
      } catch (error) {
        if (controller.signal.aborted) return;
        setBulkMessage(error instanceof Error ? error.message : "Unable to filter documents.");
      } finally {
        setLoadingResults(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    buildQuery,
    searchFilter,
    filterFolderId,
    typeFilter,
    aiFilter,
    sortOrder,
    initialDocuments,
    initialHasMore,
    initialTotal,
  ]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/documents?${buildQuery(currentPage + 1)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load more documents.");
      setDocuments((current) => {
        const existing = new Set(current.map((doc) => doc.id));
        return [
          ...current,
          ...(data.documents as DocumentWithRelations[]).filter((doc) => !existing.has(doc.id)),
        ];
      });
      setCurrentPage(data.pagination.page);
      setHasMore(data.pagination.hasMore);
      setTotalCount(data.pagination.total);
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Unable to load more documents.");
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredDocs = useMemo(() => {
    const query = deferredSearchFilter.trim().toLowerCase();
    const result = documents.filter((doc) => {
      const matchesFolder = filterFolderId ? doc.folderId === filterFolderId : true;
      const matchesSearch = query
        ? doc.name.toLowerCase().includes(query) ||
          doc.folder?.name?.toLowerCase().includes(query) ||
          (Array.isArray(doc.tags) &&
            doc.tags.some((t) => t?.tag?.name?.toLowerCase().includes(query)))
        : true;
      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "pdf"
          ? doc.mimeType === "application/pdf"
          : doc.mimeType.startsWith("image/"));
      const status = doc.aiProcessing?.status || "NOT_REQUESTED";
      const matchesAi = aiFilter === "all" || status === aiFilter;
      return matchesFolder && matchesSearch && matchesType && matchesAi;
    });
    result.sort((a, b) => {
      if (sortOrder === "name") return a.name.localeCompare(b.name);
      if (sortOrder === "oldest")
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortOrder === "opened")
        return (
          new Date(b.lastOpenedAt || b.createdAt).getTime() -
          new Date(a.lastOpenedAt || a.createdAt).getTime()
        );
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return result;
  }, [documents, filterFolderId, deferredSearchFilter, typeFilter, aiFilter, sortOrder]);

  const toggleSelected = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const handleBulkAi = async () => {
    const ownedIds = selectedIds.filter((id) =>
      documents.some((doc) => doc.id === id && doc.ownerId === currentUserId),
    );
    if (!ownedIds.length) return;
    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const response = await fetch("/api/documents/ai/batch", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ documentIds: ownedIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue AI processing.");
      setBulkMessage(`${data.queued} document(s) queued for AI processing.`);
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Bulk action failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const hasFilters = Boolean(
    searchFilter || filterFolderId || typeFilter !== "all" || aiFilter !== "all",
  );

  return (
    <>
      <PageHeader
        eyebrow="Document library"
        title="All Documents"
        description={`Browse and filter every file in your private vault (${totalCount})`}
        icon={<FileText className="h-5 w-5" />}
        actions={
          <>
            <Link
              href="/documents"
              className="btn btn-secondary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
            >
              <ArrowLeft className="h-4 w-4" />
              Overview
            </Link>
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

      {!isConnected && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-warning/30 bg-warning-subtle/40 text-text-primary">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-text-primary">
                Google Drive is not connected
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Connect your Google Drive in Settings to enable document uploads and storage sync.
              </p>
            </div>
          </div>
          <Link href="/settings">
            <Button size="sm" variant="secondary" className="shrink-0 gap-1.5">
              <Cloud className="h-4 w-4" />
              Connect Google Drive
            </Button>
          </Link>
        </div>
      )}

      {filterFolderId && (
        <nav aria-label="Folder breadcrumb" className="mb-3 flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setFilterFolderId("")}
            className="text-text-muted hover:text-brand"
          >
            Documents
          </button>
          <span className="text-text-muted" aria-hidden="true">
            /
          </span>
          <span className="font-medium text-text-primary">
            {folders.find((folder) => folder.id === filterFolderId)?.name || "Folder"}
          </span>
        </nav>
      )}

      <div className="toolbar-surface p-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
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
              className="w-full sm:w-52"
            >
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full sm:w-32"
            >
              <option value="all">All types</option>
              <option value="pdf">PDF</option>
              <option value="image">Images</option>
            </Select>
            <Select
              value={aiFilter}
              onChange={(e) => setAiFilter(e.target.value)}
              className="w-full sm:w-36"
            >
              <option value="all">Any AI status</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="QUEUED">Queued</option>
              <option value="PROCESSING">Processing</option>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchFilter("");
                  setFilterFolderId("");
                  setTypeFilter("all");
                  setAiFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeader
          icon={<Files className="h-4 w-4" />}
          title={hasFilters ? "Filtered documents" : "All documents"}
          description={
            hasFilters
              ? `${filteredDocs.length} of ${totalCount} documents match your filters.`
              : "Open a document to view, share, or review its AI summary."
          }
          count={filteredDocs.length}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-36"
              >
                <option value="recent">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="opened">Recently opened</option>
                <option value="name">Name A–Z</option>
              </Select>
              <div
                className="inline-flex rounded-lg border border-border-subtle bg-surface p-1"
                role="group"
                aria-label="Document view"
              >
                <button
                  type="button"
                  aria-label="Grid view"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                  className={`rounded-md p-1.5 ${viewMode === "grid" ? "bg-brand-subtle text-brand" : "text-text-muted"}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                  className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-brand-subtle text-brand" : "text-text-muted"}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          }
        />

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand-subtle/50 p-3">
            <span className="text-sm font-medium text-text-primary">
              {selectedIds.length} selected
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleBulkAi} disabled={bulkBusy}>
                <Sparkles className="h-4 w-4" />
                {bulkBusy ? "Queueing…" : "Generate AI summaries"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </div>
          </div>
        )}
        {bulkMessage && (
          <p role="status" className="text-sm text-text-secondary">
            {bulkMessage}
          </p>
        )}
        {loadingResults ? (
          <div className="py-10 text-center text-sm text-text-muted">
            Updating document results…
          </div>
        ) : filteredDocs.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="No documents found"
              description="No files matched your filters. Upload a document or clear your search criteria."
              action={
                hasFilters ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchFilter("");
                      setFilterFolderId("");
                    }}
                  >
                    <X className="h-4 w-4" />
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={openUpload} disabled={!isConnected}>
                    <Upload className="h-4 w-4" />
                    Upload document
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "space-y-2"
            }
          >
            {filteredDocs.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className={
                  viewMode === "grid"
                    ? "card card-hover flex flex-col justify-between p-4"
                    : "card card-hover group/doc-row flex items-center justify-between gap-3 p-3"
                }
                onClick={(event) => {
                  if (
                    (event.target as HTMLElement).closest("button") ||
                    (event.target as HTMLElement).closest("a")
                  ) {
                    // Let link or button handle its own event
                  }
                }}
              >
                <div
                  className={
                    viewMode === "grid" ? "min-w-0" : "flex min-w-0 flex-1 items-center gap-3"
                  }
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${doc.name}`}
                        checked={selectedIds.includes(doc.id)}
                        onChange={() => toggleSelected(doc.id)}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                      {doc.thumbnailUrl ? (
                        <img
                          src={doc.thumbnailUrl}
                          alt=""
                          className="h-10 w-10 rounded-md border border-border-subtle object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand">
                          {doc.mimeType === "application/pdf" ? (
                            <FileText className="h-5 w-5" />
                          ) : doc.mimeType.startsWith("image/") ? (
                            <FileImage className="h-5 w-5" />
                          ) : (
                            <FileIcon className="h-5 w-5" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {doc.ownerId !== currentUserId && (
                        <span className="rounded-full bg-info-subtle px-2 py-0.5 text-[11px] font-medium text-info">
                          Shared with you
                        </span>
                      )}
                      {(doc.shareLinks?.length ?? 0) > 0 && (
                        <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-[11px] font-medium text-brand">
                          Link shared
                        </span>
                      )}
                      <AiStatusBadge
                        status={doc.aiProcessing?.status}
                        createdAt={doc.aiProcessing?.createdAt}
                        showQueueTime
                      />
                    </div>
                  </div>
                  {doc.aiProcessing?.status === "FAILED" && doc.aiProcessing.errorMessage && (
                    <div className="mb-2 flex items-start justify-between gap-2 rounded border border-danger/20 bg-danger-subtle px-2 py-1.5">
                      <p className="line-clamp-2 flex-1 text-[10px] text-danger">
                        {doc.aiProcessing.errorMessage}
                      </p>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleRetryAi(doc.id);
                        }}
                        disabled={retryingId === doc.id}
                        className="whitespace-nowrap text-[10px] font-semibold text-brand hover:underline disabled:opacity-50"
                      >
                        {retryingId === doc.id ? "Retrying..." : "Retry"}
                      </button>
                    </div>
                  )}

                  <h3 className="mb-1 truncate text-[13px] font-semibold text-text-primary">
                    {doc.name}
                  </h3>
                  <p className="mb-1 truncate text-[12px] text-text-muted">
                    {doc.folder?.name || "Unfiled"}
                  </p>
                  {doc.expiryDate && (
                    <p
                      className={`mb-2 text-[11px] ${(() => {
                        const t = new Date(doc.expiryDate).getTime();
                        return !isNaN(t) && t < now ? "text-danger" : "text-warning";
                      })()}`}
                    >
                      {(() => {
                        const t = new Date(doc.expiryDate).getTime();
                        return !isNaN(t) && t < now ? "Expired" : "Expires";
                      })()}{" "}
                      {(() => {
                        try {
                          const d = new Date(doc.expiryDate);
                          return isNaN(d.getTime())
                            ? String(doc.expiryDate)
                            : d.toLocaleDateString();
                        } catch {
                          return String(doc.expiryDate);
                        }
                      })()}
                    </p>
                  )}

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

                <div
                  className={
                    viewMode === "grid"
                      ? "flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11px] text-text-muted"
                      : "flex shrink-0 items-center gap-3 text-[11px] text-text-muted"
                  }
                >
                  {viewMode === "list" && (
                    <div className="flex items-center gap-1 opacity-0 group-hover/doc-row:opacity-100 transition-opacity">
                      <button
                        type="button"
                        title="Download document"
                        className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(`/api/documents/${doc.id}/file`, "_blank");
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="View document details"
                        className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/documents/${doc.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div
                    className={
                      viewMode === "grid"
                        ? "flex items-center justify-between w-full"
                        : "flex flex-col items-end gap-1"
                    }
                  >
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    <span>{Math.round(doc.sizeBytes / 1024)} KB</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      {hasMore && (
        <div className="flex justify-center pt-5">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore || loadingResults}>
            {loadingMore ? "Loading…" : "Load more documents"}
          </Button>
        </div>
      )}

      <UploadModal
        isOpen={isUploadOpen}
        onClose={closeUpload}
        onUploadSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}

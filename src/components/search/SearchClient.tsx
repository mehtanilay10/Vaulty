/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Select } from "@/components/ui/Select";
import { Search, FileText, X, Clock, SlidersHorizontal, FileSearch } from "lucide-react";
import type { DocumentWithRelations } from "@/types";

const RECENT_SEARCHES_KEY = "vaulty-recent-searches";
const MAX_RECENT_SEARCHES = 8;

export function SearchClient({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<(DocumentWithRelations & { ownershipType: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileType, setFileType] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      const timer = setTimeout(() => {
        setResults([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      executeSearch(trimmed);
    }, 250);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, fileType, aiStatus, dateFrom, dateTo]);

  async function executeSearch(searchStr: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("q", searchStr);
      if (fileType) params.set("fileType", fileType);
      if (aiStatus) params.set("aiStatus", aiStatus);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.documents || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      const trimmed = query.trim();
      saveRecentSearch(trimmed);
      executeSearch(trimmed);
    }
  };

  const saveRecentSearch = (term: string) => {
    try {
      const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(
        0,
        MAX_RECENT_SEARCHES,
      );
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) => {
      regex.lastIndex = 0;
      return regex.test(part) ? (
        <mark key={i} className="rounded-sm bg-brand/20 px-0.5 text-text-primary">
          {part}
        </mark>
      ) : (
        part
      );
    });
  };

  const hasFilters = Boolean(fileType || aiStatus || dateFrom || dateTo);

  return (
    <>
      <PageHeader title="Search Vault" icon={<Search className="h-5 w-5" />} />

      <div className="toolbar-surface p-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. passport, blood test, insurance..."
              className="h-10 w-full pl-9 text-sm"
            />
          </div>
          <Button type="submit" disabled={loading || !query.trim()} className="h-10 px-5">
            {loading ? "Searching..." : "Search"}
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </span>
          <Select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            className="h-8 w-auto min-w-[9rem] py-1 text-xs"
            aria-label="Filter by file type"
          >
            <option value="">All file types</option>
            <option value="application/pdf">PDF</option>
            <option value="image/">Images</option>
          </Select>
          <Select
            value={aiStatus}
            onChange={(e) => setAiStatus(e.target.value)}
            className="h-8 w-auto min-w-[9.5rem] py-1 text-xs"
            aria-label="Filter by AI status"
          >
            <option value="">All AI statuses</option>
            <option value="COMPLETED">AI Ready</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
            <option value="QUEUED">Queued</option>
          </Select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input h-8 px-2 py-1 text-xs"
            placeholder="From date"
            aria-label="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input h-8 px-2 py-1 text-xs"
            placeholder="To date"
            aria-label="To date"
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFileType("");
                setAiStatus("");
                setDateFrom("");
                setDateTo("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          )}
        </div>

        {recentSearches.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
            <Clock className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-[11px] font-medium text-text-muted">Recent:</span>
            {recentSearches.map((term) => (
              <button
                key={term}
                onClick={() => {
                  setQuery(term);
                  executeSearch(term);
                }}
                className="rounded border border-border-subtle bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-brand transition-colors hover:border-brand/30 hover:bg-brand-subtle"
              >
                {term}
              </button>
            ))}
            <button
              onClick={clearRecentSearches}
              className="text-[11px] text-text-muted transition-colors hover:text-danger"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {(loading || results.length > 0) && (
        <SectionHeader
          icon={<FileSearch className="h-4 w-4" />}
          title={loading ? "Searching..." : "Search results"}
          description={
            loading
              ? `Looking for “${query}” across your vault.`
              : `${results.length} document match${results.length === 1 ? "" : "es"} for “${query}”.`
          }
          count={loading ? undefined : results.length}
        />
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <Skeleton className="h-10 w-10" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="mb-2 h-4 w-3/4" />
              <Skeleton className="mb-3 h-3 w-1/2" />
              <Skeleton className="h-12 w-full" />
            </Card>
          ))}
        </div>
      )}

      {results.length === 0 && query.trim() && !loading && (
        <Card className="p-0">
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="No matching documents"
            description="No documents match your query or you do not have permission to view them."
          />
        </Card>
      )}

      {!loading && results.length === 0 && !query.trim() && (
        <Card className="p-0">
          <EmptyState
            icon={<FileSearch className="h-6 w-6" />}
            title="Start searching your vault"
            description="Search by filename, folder, tag, or text within AI-generated summaries. Use the filters above to narrow results."
          />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((doc) => (
          <Link
            key={doc.id}
            href={`/documents/${doc.id}`}
            className="group flex flex-col justify-between rounded-xl border border-border-subtle bg-surface p-4 shadow-xs transition-all hover:border-border-strong hover:bg-surface-elevated hover:shadow-sm"
          >
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                {doc.thumbnailUrl ? (
                  <img
                    src={doc.thumbnailUrl}
                    alt=""
                    className="h-10 w-10 rounded-lg border border-border-subtle object-cover shadow-2xs"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-brand transition-colors group-hover:border-brand/25 group-hover:bg-brand-subtle">
                    <FileText className="h-5 w-5" />
                  </div>
                )}
                <Badge variant={doc.ownershipType === "Owned by me" ? "default" : "info"}>
                  {doc.ownershipType}
                </Badge>
              </div>

              <p className="mb-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {doc.folder?.name || "Unfiled"}
              </p>
              <h3 className="mb-2 truncate text-[13.5px] font-semibold tracking-tight text-text-primary group-hover:text-brand">
                {highlightMatch(doc.name, query)}
              </h3>

              {doc.aiProcessing?.summaryMarkdown && (
                <p className="line-clamp-2 rounded-lg border border-border-subtle bg-surface-muted/60 p-2.5 text-[11.5px] leading-relaxed text-text-secondary">
                  {highlightMatch(doc.aiProcessing.summaryMarkdown.replace(/#/g, ""), query)}
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11px] text-text-muted">
              <span className="truncate">Owner: {doc.owner?.name || doc.owner?.email}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {new Date(doc.createdAt).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

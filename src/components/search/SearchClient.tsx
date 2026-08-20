"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Search, FileText } from "lucide-react";

export function SearchClient({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialQuery.trim()) {
      executeSearch(initialQuery.trim());
    }
  }, [initialQuery]);

  const executeSearch = async (searchStr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchStr)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.documents || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      executeSearch(query.trim());
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Search Private Vault"
        description="Search across filenames, folders, tags, and AI summary text"
        icon={<Search className="w-7 h-7" />}
      />

      <form onSubmit={handleSearchSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-text-muted absolute left-4 top-3.5 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search e.g. passport, blood test, insurance..."
            className="w-full pl-12 pr-4 py-2.5 text-base"
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </form>

      {results.length > 0 && (
        <p className="text-xs text-text-muted">
          Found {results.length} document match{results.length === 1 ? "" : "es"} for &quot;{query}&quot;
        </p>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-3/4 mb-3" />
              <Skeleton className="h-3 w-1/2" />
            </Card>
          ))}
        </div>
      )}

      {results.length === 0 && query.trim() && !loading && (
        <Card>
          <EmptyState
            icon={<Search className="w-10 h-10" />}
            title="No matching documents"
            description="No documents match your query or you do not have permission to view them."
          />
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((doc) => (
          <Link
            key={doc.id}
            href={`/documents/${doc.id}`}
            className="card card-hover p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="p-2.5 rounded-lg bg-brand-subtle text-brand">
                  <FileText className="w-5 h-5" />
                </div>
                <Badge variant={doc.ownershipType === "Owned by me" ? "default" : "info"}>
                  {doc.ownershipType}
                </Badge>
              </div>

              <h3 className="font-semibold text-sm text-text-primary truncate mb-1">
                {doc.name}
              </h3>
              <p className="text-xs text-text-muted truncate mb-2">
                {doc.folder?.name}
              </p>

              {doc.aiProcessing?.summaryMarkdown && (
                <p className="text-xs text-text-muted line-clamp-2 bg-surface-muted p-2.5 rounded-md border border-border-subtle">
                  {doc.aiProcessing.summaryMarkdown.replace(/#/g, "")}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border-subtle text-[11px] text-text-muted">
              <span>Owner: {doc.owner?.name || doc.owner?.email}</span>
              <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

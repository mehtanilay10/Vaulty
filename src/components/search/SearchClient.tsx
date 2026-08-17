"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Search, FileText, Folder, Tag, Sparkles, CheckCircle2, Shield } from "lucide-react";

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
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col transition-colors">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <Search className="w-7 h-7 text-accent-primary" />
              <span>Search Private Vault</span>
            </h1>
            <p className="text-text-secondary text-sm">
              Search across filenames, folders, tags, and AI summary text (Permission Scoped)
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-5 h-5 text-text-muted absolute left-4 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. passport, blood test, insurance..."
              className="vault-input w-full pl-12 pr-24 py-3 text-base placeholder:text-text-muted"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 top-2 px-5 py-1.5 rounded-xl vault-btn-primary text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          {results.length > 0 && (
            <p className="text-xs text-text-muted">
              Found {results.length} document match{results.length === 1 ? "" : "es"} for &quot;{query}&quot;
            </p>
          )}

          {results.length === 0 && query.trim() && !loading && (
            <div className="vault-card p-12 text-center space-y-2">
              <Search className="w-10 h-10 text-text-muted mx-auto" />
              <h3 className="text-base font-semibold text-text-secondary">No matching documents</h3>
              <p className="text-xs text-text-muted">
                No documents match your query or you do not have permission to view them.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="vault-card vault-card-hover p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="p-2.5 rounded-xl bg-accent-primary-soft text-accent-primary">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        doc.ownershipType === "Owned by me"
                          ? "bg-accent-primary-soft text-accent-primary border-accent-primary/20"
                          : "bg-accent-emerald-soft text-accent-emerald border-accent-emerald/20"
                      }`}
                    >
                      {doc.ownershipType}
                    </span>
                  </div>

                  <h3 className="font-semibold text-sm text-text-primary truncate mb-1">
                    {doc.name}
                  </h3>
                  <p className="text-xs text-text-muted truncate mb-2">
                    📁 {doc.folder?.name}
                  </p>

                  {doc.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {doc.tags.map((t: any) => (
                        <span
                          key={t.tag.id}
                          className="px-2 py-0.5 rounded-md bg-bg-muted text-text-secondary text-[10px] font-medium"
                        >
                          #{t.tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {doc.aiProcessing?.summaryMarkdown && (
                    <p className="text-xs text-text-muted line-clamp-2 bg-bg-muted p-2.5 rounded-xl border border-border-subtle font-mono">
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
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

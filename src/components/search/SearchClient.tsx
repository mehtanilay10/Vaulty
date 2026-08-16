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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Search className="w-7 h-7 text-indigo-400" />
              <span>Search Private Vault</span>
            </h1>
            <p className="text-slate-400 text-sm">
              Search across filenames, folders, tags, and AI summary text (Permission Scoped)
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. passport, blood test, insurance..."
              className="w-full pl-12 pr-24 py-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-lg"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 top-2 px-5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          {results.length > 0 && (
            <p className="text-xs text-slate-400">
              Found {results.length} document match{results.length === 1 ? "" : "es"} for &quot;{query}&quot;
            </p>
          )}

          {results.length === 0 && query.trim() && !loading && (
            <div className="p-12 rounded-3xl bg-slate-900/40 border border-slate-800/80 text-center space-y-2">
              <Search className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-semibold text-slate-300">No matching documents</h3>
              <p className="text-xs text-slate-500">
                No documents match your query or you do not have permission to view them.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-800/70 border border-slate-800/80 hover:border-indigo-500/40 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        doc.ownershipType === "Owned by me"
                          ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      }`}
                    >
                      {doc.ownershipType}
                    </span>
                  </div>

                  <h3 className="font-semibold text-sm text-slate-200 group-hover:text-white truncate mb-1">
                    {doc.name}
                  </h3>
                  <p className="text-xs text-slate-400 truncate mb-2">
                    📁 {doc.folder?.name}
                  </p>

                  {doc.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {doc.tags.map((t: any) => (
                        <span
                          key={t.tag.id}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 text-[10px] font-medium"
                        >
                          #{t.tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {doc.aiProcessing?.summaryMarkdown && (
                    <p className="text-xs text-slate-400 line-clamp-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 font-mono">
                      {doc.aiProcessing.summaryMarkdown.replace(/#/g, "")}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/60 text-[11px] text-slate-500">
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

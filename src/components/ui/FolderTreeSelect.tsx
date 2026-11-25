"use client";

import { useId, useMemo, useRef, useState, useEffect } from "react";
import { Folder, FolderOpen, ChevronRight, ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FolderItem {
  id: string;
  name: string;
  parentId?: string | null;
}

interface FolderTreeSelectProps {
  folders: FolderItem[];
  value: string;
  onChange: (folderId: string) => void;
  placeholder?: string;
  allOptionLabel?: string;
  rootOptionLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  path: string;
  children: TreeNode[];
}

export function FolderTreeSelect({
  folders,
  value,
  onChange,
  placeholder = "Select folder...",
  allOptionLabel,
  rootOptionLabel,
  disabled = false,
  className,
  size = "md",
}: FolderTreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (value) {
      const map = new Map<string, FolderItem>();
      folders.forEach((f) => map.set(f.id, f));
      let curr = map.get(value);
      while (curr?.parentId) {
        initial.add(curr.parentId);
        curr = map.get(curr.parentId);
      }
    }
    return initial;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Build folder map & tree
  const { folderMap, rootNodes, flatList } = useMemo(() => {
    const map = new Map<string, FolderItem>();
    folders.forEach((f) => map.set(f.id, f));

    function getPath(folder: FolderItem): string {
      const parts = [folder.name];
      let curr = folder;
      const visited = new Set<string>([curr.id]);
      while (curr.parentId) {
        const parent = map.get(curr.parentId);
        if (!parent || visited.has(parent.id)) break;
        visited.add(parent.id);
        parts.unshift(parent.name);
        curr = parent;
      }
      return parts.join(" / ");
    }

    const childrenMap = new Map<string | null, FolderItem[]>();
    folders.forEach((f) => {
      const pId = f.parentId || null;
      const list = childrenMap.get(pId) || [];
      list.push(f);
      childrenMap.set(pId, list);
    });

    childrenMap.forEach((list) => {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    });

    const flat: TreeNode[] = [];

    function buildNodes(parentId: string | null, depth: number): TreeNode[] {
      const children = childrenMap.get(parentId) || [];
      return children.map((child) => {
        const path = getPath(child);
        const node: TreeNode = {
          id: child.id,
          name: child.name,
          parentId: child.parentId || null,
          depth,
          path,
          children: [],
        };
        flat.push(node);
        node.children = buildNodes(child.id, depth + 1);
        return node;
      });
    }

    const roots = buildNodes(null, 0);

    // Pick up orphans if any
    const included = new Set(flat.map((n) => n.id));
    const orphans = folders.filter((f) => !included.has(f.id));
    for (const orphan of orphans) {
      const node: TreeNode = {
        id: orphan.id,
        name: orphan.name,
        parentId: orphan.parentId || null,
        depth: 0,
        path: getPath(orphan),
        children: [],
      };
      roots.push(node);
      flat.push(node);
    }

    return { folderMap: map, rootNodes: roots, flatList: flat };
  }, [folders]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch("");
  };

  const selectedNode = flatList.find((n) => n.id === value);
  const selectedLabel = selectedNode
    ? selectedNode.path
    : value === "" && allOptionLabel
      ? allOptionLabel
      : value === "" && rootOptionLabel
        ? rootOptionLabel
        : placeholder;

  // Filter tree by search term
  const query = search.trim().toLowerCase();
  const searchMatchedIds = useMemo(() => {
    if (!query) return null;
    const matches = new Set<string>();
    flatList.forEach((node) => {
      if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) {
        matches.add(node.id);
        // Also add all ancestors to keep hierarchy visible
        let curr = folderMap.get(node.id);
        while (curr?.parentId) {
          matches.add(curr.parentId);
          curr = folderMap.get(curr.parentId);
        }
      }
    });
    return matches;
  }, [query, flatList, folderMap]);

  function renderNode(node: TreeNode) {
    if (searchMatchedIds && !searchMatchedIds.has(node.id)) {
      return null;
    }

    const hasChildren = node.children.length > 0;
    const isExpanded = query ? true : expandedIds.has(node.id);
    const isSelected = value === node.id;

    return (
      <div key={node.id} className="select-none">
        <div
          role="option"
          aria-selected={isSelected}
          onClick={() => handleSelect(node.id)}
          className={cn(
            "group relative flex items-center gap-1.5 py-1.5 pr-2 rounded-md cursor-pointer text-xs transition-colors",
            isSelected
              ? "bg-brand/10 text-brand font-medium"
              : "text-text-primary hover:bg-surface-muted",
          )}
          style={{ paddingLeft: `${Math.max(6, node.depth * 18 + 6)}px` }}
        >
          {/* Tree guide line for nested nodes */}
          {node.depth > 0 && (
            <span
              aria-hidden="true"
              className="absolute left-[14px] top-0 bottom-0 border-l border-border-subtle/70 pointer-events-none"
              style={{ left: `${node.depth * 18 - 8}px` }}
            />
          )}

          {/* Expand / collapse chevron */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => toggleExpand(node.id, e)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-muted hover:text-text-primary transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-5 shrink-0" aria-hidden="true" />
          )}

          {/* Folder Icon */}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-brand" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-brand/80" />
          )}

          {/* Folder Name */}
          <span className="truncate flex-1 font-medium">{node.name}</span>

          {/* Subfolder count badge if folder has children */}
          {hasChildren && (
            <span className="text-[10px] text-text-muted opacity-70 group-hover:opacity-100 font-mono px-1">
              {node.children.length}
            </span>
          )}

          {/* Selected checkmark */}
          {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-brand ml-1" />}
        </div>

        {/* Children nodes */}
        {hasChildren && isExpanded && (
          <div className="relative">{node.children.map(renderNode)}</div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block w-full text-left", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface text-text-primary shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:opacity-50 disabled:pointer-events-none",
          size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-xs sm:text-sm",
          isOpen && "ring-2 ring-brand border-brand",
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Folder className="h-3.5 w-3.5 text-brand shrink-0" />
          <span
            className={cn(
              "truncate text-left",
              !selectedNode && !value ? "text-text-muted" : "text-text-primary font-medium",
            )}
          >
            {selectedLabel}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-text-muted shrink-0 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {/* Popover Tree Menu */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          className="absolute left-0 top-full z-[100] mt-1.5 w-full min-w-[260px] max-w-[420px] rounded-lg border border-border-subtle bg-surface-elevated p-1.5 shadow-fluent-16 animate-fade-in focus:outline-none"
        >
          {/* Quick Search */}
          {folders.length > 5 && (
            <div className="relative mb-1.5 px-1 pt-0.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search folders..."
                className="w-full rounded-md border border-border-subtle bg-surface-muted/60 pl-8 pr-7 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Scrollable Tree Container */}
          <div className="max-h-64 overflow-y-auto px-0.5 py-0.5 space-y-0.5">
            {/* Special Top Option: All Folders */}
            {allOptionLabel && !query && (
              <div
                role="option"
                aria-selected={value === ""}
                onClick={() => handleSelect("")}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition-colors",
                  value === ""
                    ? "bg-brand/10 text-brand font-semibold"
                    : "text-text-primary hover:bg-surface-muted",
                )}
              >
                <Folder className="h-4 w-4 text-text-muted shrink-0" />
                <span className="truncate flex-1">{allOptionLabel}</span>
                {value === "" && <Check className="h-3.5 w-3.5 shrink-0 text-brand" />}
              </div>
            )}

            {/* Special Top Option: Root Folder (no parent) */}
            {rootOptionLabel && !query && (
              <div
                role="option"
                aria-selected={value === ""}
                onClick={() => handleSelect("")}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition-colors",
                  value === ""
                    ? "bg-brand/10 text-brand font-semibold"
                    : "text-text-primary hover:bg-surface-muted",
                )}
              >
                <Folder className="h-4 w-4 text-text-muted shrink-0" />
                <span className="truncate flex-1">{rootOptionLabel}</span>
                {value === "" && <Check className="h-3.5 w-3.5 shrink-0 text-brand" />}
              </div>
            )}

            {/* Tree Nodes */}
            {rootNodes.map(renderNode)}

            {/* Empty States */}
            {rootNodes.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-text-muted">No folders available.</p>
            )}
            {rootNodes.length > 0 && query && searchMatchedIds && searchMatchedIds.size === 0 && (
              <p className="px-3 py-4 text-center text-xs text-text-muted">
                No matching folders found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

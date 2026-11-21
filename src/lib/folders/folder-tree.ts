export interface RawFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface FolderTreeItem {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  path: string;
  treeLabel: string;
}

/**
 * Builds a hierarchical tree-ordered list of folders with indentation and full path.
 * Ideal for `<select>` dropdowns and picker blades where users need to understand
 * the exact location of subfolders.
 */
export function buildFolderTree(folders: RawFolder[]): FolderTreeItem[] {
  if (!folders || folders.length === 0) return [];

  const folderMap = new Map<string, RawFolder>();
  folders.forEach((f) => folderMap.set(f.id, f));

  // Compute full breadcrumb path for any folder
  function getPath(folder: RawFolder): string {
    const segments: string[] = [folder.name];
    let curr = folder;
    const visited = new Set<string>([curr.id]);

    while (curr.parentId) {
      const parent = folderMap.get(curr.parentId);
      if (!parent || visited.has(parent.id)) break;
      visited.add(parent.id);
      segments.unshift(parent.name);
      curr = parent;
    }
    return segments.join(" / ");
  }

  // Group children by parentId
  const childrenByParent = new Map<string | null, RawFolder[]>();
  folders.forEach((f) => {
    const pId = f.parentId || null;
    const list = childrenByParent.get(pId) || [];
    list.push(f);
    childrenByParent.set(pId, list);
  });

  // Sort sibling folders alphabetically
  childrenByParent.forEach((list) => {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  });

  const result: FolderTreeItem[] = [];

  function traverse(parentId: string | null, depth: number) {
    const children = childrenByParent.get(parentId) || [];
    for (const child of children) {
      const path = getPath(child);
      const indent = "\u00A0\u00A0".repeat(depth);
      const treeLabel = depth === 0 ? `📁 ${child.name}` : `${indent}└─ 📁 ${child.name} (${path})`;

      result.push({
        id: child.id,
        name: child.name,
        parentId: child.parentId || null,
        depth,
        path,
        treeLabel,
      });

      traverse(child.id, depth + 1);
    }
  }

  // Start with root folders (parentId is null)
  traverse(null, 0);

  // If there are orphan folders whose parent wasn't in the list, append them at depth 0
  const includedIds = new Set(result.map((r) => r.id));
  const orphans = folders.filter((f) => !includedIds.has(f.id));
  for (const orphan of orphans) {
    const path = getPath(orphan);
    result.push({
      id: orphan.id,
      name: orphan.name,
      parentId: orphan.parentId || null,
      depth: 0,
      path,
      treeLabel: `📁 ${orphan.name} (${path})`,
    });
  }

  return result;
}

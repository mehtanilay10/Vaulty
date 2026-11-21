import { prisma } from "@/lib/prisma";

const MAX_FOLDER_DEPTH = 50;

export async function getFolderHierarchyPath(folderId: string): Promise<string[]> {
  const root = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, name: true, parentId: true, ownerId: true },
  });

  if (!root) return [];

  const cleanName = (name: string) => name.replace(/[/\\?%*:|"<>]/g, "_").trim();
  const segments: string[] = [cleanName(root.name)];

  if (!root.parentId) {
    return segments;
  }

  // Batch fetch owner's folders to walk the ancestor tree in memory in a single query
  const ownerFolders = await prisma.folder.findMany({
    where: { ownerId: root.ownerId },
    select: { id: true, name: true, parentId: true },
  });

  const folderMap = new Map(ownerFolders.map((f) => [f.id, f]));
  const visited = new Set<string>([root.id]);
  let currentId: string | null = root.parentId;

  while (currentId && segments.length < MAX_FOLDER_DEPTH) {
    if (visited.has(currentId)) {
      console.error(`[folder-path] Circular folder reference detected at folder ID: ${currentId}`);
      break;
    }
    visited.add(currentId);

    const parent = folderMap.get(currentId);
    if (!parent) break;

    segments.unshift(cleanName(parent.name));
    currentId = parent.parentId;
  }

  return segments;
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, hasFamilyModuleAccessMock } = vi.hoisted(() => ({
  prismaMock: {
    folder: { findUnique: vi.fn() },
    folderShare: { findUnique: vi.fn(), findFirst: vi.fn() },
    document: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
  hasFamilyModuleAccessMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/family-access", () => ({
  hasFamilyModuleAccess: hasFamilyModuleAccessMock,
}));

import { checkDocumentAccess, checkFolderAccess } from "@/lib/authz";

const NONE = {
  hasAccess: false,
  isOwner: false,
  isShared: false,
  permission: "NONE",
} as const;

beforeEach(() => {
  prismaMock.folder.findUnique.mockReset();
  prismaMock.folderShare.findUnique.mockReset();
  prismaMock.folderShare.findFirst.mockReset();
  prismaMock.document.findUnique.mockReset();
  prismaMock.$queryRaw.mockReset();
  hasFamilyModuleAccessMock.mockReset();
});

describe("checkFolderAccess", () => {
  it("returns NONE for a missing folder", async () => {
    prismaMock.folder.findUnique.mockResolvedValue(null);

    await expect(checkFolderAccess("user-1", "folder-1")).resolves.toEqual(NONE);
    expect(hasFamilyModuleAccessMock).not.toHaveBeenCalled();
  });

  it("grants full access to the owner without family lookups", async () => {
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "folder-1",
      ownerId: "user-1",
      parentId: null,
    });

    await expect(checkFolderAccess("user-1", "folder-1")).resolves.toEqual({
      hasAccess: true,
      isOwner: true,
      isShared: false,
      permission: "OWNER",
    });
    expect(hasFamilyModuleAccessMock).not.toHaveBeenCalled();
  });

  it("grants read-only access through a direct folder share", async () => {
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "folder-1",
      ownerId: "owner-1",
      parentId: null,
    });
    prismaMock.folderShare.findUnique.mockResolvedValue({ id: "share-1" });

    await expect(checkFolderAccess("user-1", "folder-1")).resolves.toEqual({
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    });
  });

  it("grants read-only access to a root folder shared with the family", async () => {
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "folder-1",
      ownerId: "owner-1",
      parentId: null,
    });
    prismaMock.folderShare.findUnique.mockResolvedValue(null);
    hasFamilyModuleAccessMock.mockResolvedValue(true);

    await expect(checkFolderAccess("user-1", "folder-1")).resolves.toEqual({
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    });
    expect(hasFamilyModuleAccessMock).toHaveBeenCalledWith("user-1", "owner-1", "documents");
  });

  it("denies a root folder when neither share nor family access exists", async () => {
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "folder-1",
      ownerId: "owner-1",
      parentId: null,
    });
    prismaMock.folderShare.findUnique.mockResolvedValue(null);
    hasFamilyModuleAccessMock.mockResolvedValue(false);

    await expect(checkFolderAccess("user-1", "folder-1")).resolves.toEqual(NONE);
  });

  it("grants read-only access through a shared ancestor", async () => {
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "child-folder",
      ownerId: "owner-1",
      parentId: "parent-folder",
    });
    prismaMock.folderShare.findUnique.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([{ id: "parent-folder" }, { id: "root-folder" }]);
    prismaMock.folderShare.findFirst.mockResolvedValue({
      id: "share-1",
      folder: { ownerId: "owner-1" },
    });

    await expect(checkFolderAccess("user-1", "child-folder")).resolves.toEqual({
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    });
    expect(hasFamilyModuleAccessMock).not.toHaveBeenCalled();
  });

  it("falls back to family access for nested folders", async () => {
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "child-folder",
      ownerId: "owner-1",
      parentId: "parent-folder",
    });
    prismaMock.folderShare.findUnique.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([{ id: "parent-folder" }]);
    prismaMock.folderShare.findFirst.mockResolvedValue(null);
    hasFamilyModuleAccessMock.mockResolvedValue(true);

    await expect(checkFolderAccess("user-1", "child-folder")).resolves.toEqual({
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    });
  });

  it("denies nested folders when the ancestor chain is empty", async () => {
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "child-folder",
      ownerId: "owner-1",
      parentId: "missing-parent",
    });
    prismaMock.folderShare.findUnique.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([]);

    await expect(checkFolderAccess("user-1", "child-folder")).resolves.toEqual(NONE);
  });

  it("does not expose the owner's folder to unrelated users", async () => {
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "child-folder",
      ownerId: "owner-1",
      parentId: "parent-folder",
    });
    prismaMock.folderShare.findUnique.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([{ id: "parent-folder" }]);
    prismaMock.folderShare.findFirst.mockResolvedValue(null);
    hasFamilyModuleAccessMock.mockResolvedValue(false);

    await expect(checkFolderAccess("unrelated-user", "child-folder")).resolves.toEqual(NONE);
  });
});

describe("checkDocumentAccess", () => {
  it("returns NONE for a missing document", async () => {
    prismaMock.document.findUnique.mockResolvedValue(null);

    await expect(checkDocumentAccess("user-1", "doc-1")).resolves.toEqual(NONE);
  });

  it("grants owner access without checking the folder", async () => {
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      ownerId: "user-1",
      folderId: "folder-1",
    });

    await expect(checkDocumentAccess("user-1", "doc-1")).resolves.toEqual({
      hasAccess: true,
      isOwner: true,
      isShared: false,
      permission: "OWNER",
    });
    expect(prismaMock.folder.findUnique).not.toHaveBeenCalled();
  });

  it("delegates shared document access to the folder check", async () => {
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      ownerId: "owner-1",
      folderId: "folder-1",
    });
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "folder-1",
      ownerId: "owner-1",
      parentId: null,
    });
    prismaMock.folderShare.findUnique.mockResolvedValue(null);
    hasFamilyModuleAccessMock.mockResolvedValue(true);

    await expect(checkDocumentAccess("user-1", "doc-1")).resolves.toEqual({
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    });
  });

  it("denies a document when the containing folder is not accessible", async () => {
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      ownerId: "owner-1",
      folderId: "folder-1",
    });
    prismaMock.folder.findUnique.mockResolvedValue({
      id: "folder-1",
      ownerId: "owner-1",
      parentId: null,
    });
    prismaMock.folderShare.findUnique.mockResolvedValue(null);
    hasFamilyModuleAccessMock.mockResolvedValue(false);

    await expect(checkDocumentAccess("user-1", "doc-1")).resolves.toEqual(NONE);
  });

  it("grants read-only access to a root document when family document sharing is active", async () => {
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      ownerId: "owner-1",
      folderId: null,
    });
    hasFamilyModuleAccessMock.mockResolvedValue(true);

    await expect(checkDocumentAccess("user-1", "doc-1")).resolves.toEqual({
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    });
    expect(prismaMock.folder.findUnique).not.toHaveBeenCalled();
  });

  it("denies a root document when family document sharing is not active", async () => {
    prismaMock.document.findUnique.mockResolvedValue({
      id: "doc-1",
      ownerId: "owner-1",
      folderId: null,
    });
    hasFamilyModuleAccessMock.mockResolvedValue(false);

    await expect(checkDocumentAccess("user-1", "doc-1")).resolves.toEqual(NONE);
    expect(prismaMock.folder.findUnique).not.toHaveBeenCalled();
  });
});

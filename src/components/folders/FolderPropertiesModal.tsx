"use client";

import { useState, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { Blade } from "@/components/ui/Blade";
import { X, Folder, Trash2, Users, Search, UserPlus, AlertTriangle, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { FolderWithCounts, User } from "@/types";

export function FolderPropertiesModal({
  isOpen,
  onClose,
  folder,
  isOwner,
  onFolderUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  folder: FolderWithCounts;
  isOwner: boolean;
  onFolderUpdated?: () => void;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"general" | "sharing">("general");
  const [folderName, setFolderName] = useState(folder?.name || "");
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [shares, setShares] = useState(folder?.shares || []);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function searchUsers() {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(userQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (folder) {
      setFolderName(folder.name);
      setShares(folder.shares || []);
    }
  }, [folder]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (userQuery.trim().length >= 2) {
      searchUsers();
    } else {
      setSearchResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userQuery]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    try {
      const res = await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: folderName.trim() }),
      });

      if (!res.ok) throw new Error("Failed to rename folder.");

      setSuccessMsg("Folder renamed successfully.");
      if (onFolderUpdated) onFolderUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rename failed.";
      setError(message);
    }
  };

  const handleDeleteFolder = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folder.id}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });

      if (!res.ok) throw new Error("Failed to delete folder.");

      onClose();
      router.push("/folders");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete folder.";
      setError(message);
      setIsDeleting(false);
    }
  };

  const handleShareWithUser = async (userId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folder.id}/shares`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ sharedWithUserId: userId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sharing failed.");

      setUserQuery("");
      setSearchResults([]);
      setSuccessMsg("Folder shared successfully.");
      if (onFolderUpdated) onFolderUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to share folder.";
      setError(message);
    }
  };

  const handleRevokeShare = async (userId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folder.id}/shares?userId=${userId}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });

      if (!res.ok) throw new Error("Failed to revoke share.");

      setSuccessMsg("Share access revoked.");
      if (onFolderUpdated) onFolderUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Revoke failed.";
      setError(message);
    }
  };

  if (!isOpen || !folder) return null;

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title={folder.name}
      description="Folder settings & permissions"
      icon={<Folder className="h-4 w-4" />}
      size="lg"
      subheader={
        <div className="flex bg-surface-muted px-6">
          <button
            onClick={() => setActiveTab("general")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "general"
                ? "border-brand text-brand"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            General &amp; Actions
          </button>
          <button
            onClick={() => setActiveTab("sharing")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "sharing"
                ? "border-brand text-brand"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Folder Sharing ({shares.length})</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3 rounded-xl bg-danger-subtle border border-danger/20 text-danger text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-success-subtle border border-success/20 text-success text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {activeTab === "general" && (
          <div className="space-y-6">
            <form onSubmit={handleRename} className="space-y-3">
              <label className="block text-xs font-semibold text-text-secondary">Folder Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  disabled={!isOwner}
                  className="input flex-1 px-4 py-2.5 text-sm disabled:opacity-60"
                />
                {isOwner && (
                  <button type="submit" className="btn btn-primary px-4 py-2.5 text-xs">
                    Save
                  </button>
                )}
              </div>
            </form>

            <div className="p-4 rounded-2xl bg-surface-muted border border-border-subtle text-xs text-text-secondary space-y-2">
              <div className="flex justify-between">
                <span>Owner:</span>
                <span className="text-text-primary font-medium">
                  {folder.owner?.name || folder.owner?.email || "You"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Created:</span>
                <span className="text-text-primary">
                  {new Date(folder.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Your Permission:</span>
                <span className="text-brand font-semibold uppercase">
                  {isOwner ? "Owner" : "Read Only"}
                </span>
              </div>
            </div>

            {isOwner && (
              <div className="pt-4 border-t border-border-subtle">
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-danger-subtle hover:bg-danger-subtle border border-danger/20 text-danger font-medium text-xs transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Folder &amp; All Contained Files</span>
                  </button>
                ) : (
                  <div className="p-4 rounded-2xl bg-danger-subtle border border-danger/20 space-y-3">
                    <div className="flex items-center gap-2 text-danger font-semibold text-xs">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Confirm Destructive Deletion</span>
                    </div>
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      Deleting &quot;{folder.name}&quot; will permanently remove this folder, all
                      nested subfolders, and all contained files. This action cannot be undone.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-2 rounded-xl bg-surface-muted text-text-secondary text-xs font-medium hover:bg-surface-muted transition-colors flex items-center justify-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteFolder}
                        disabled={isDeleting}
                        className="flex-1 py-2 rounded-xl bg-danger hover:bg-danger text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {isDeleting ? (
                          "Deleting..."
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            Permanently Delete
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "sharing" && (
          <div className="space-y-6">
            {!isOwner ? (
              <div className="p-4 rounded-2xl bg-surface-muted border border-border-subtle text-xs text-text-secondary space-y-1">
                <p className="font-semibold text-text-primary">Shared Access Notice</p>
                <p>
                  You have Read-Only access to this folder. Only the folder owner can modify sharing
                  settings.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-text-secondary">
                    Share with Registered User
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Search user by email or name..."
                      className="input w-full pl-10 pr-4 py-2.5 text-sm placeholder:text-text-muted"
                    />
                  </div>

                  {searchResults.length > 0 && (
                    <div className="bg-surface border border-border-subtle rounded-2xl p-2 space-y-1 shadow-xl max-h-48 overflow-y-auto">
                      {searchResults.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-muted transition-colors"
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <UserAvatar src={u.image} name={u.name} email={u.email} size="sm" />
                            <div className="truncate text-xs">
                              <p className="font-semibold text-text-primary truncate">
                                {u.name || "User"}
                              </p>
                              <p className="text-text-muted truncate">{u.email}</p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleShareWithUser(u.id)}
                            className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-medium flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Share</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-text-secondary">
                    Users with Access ({shares.length})
                  </h3>

                  {shares.length === 0 ? (
                    <p className="text-xs text-text-muted italic">
                      This folder is currently private and not shared with anyone.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {shares.map((share) => (
                        <div
                          key={share.id}
                          className="flex items-center justify-between p-3 rounded-2xl bg-surface-muted border border-border-subtle text-xs"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <UserAvatar
                              src={share.sharedWith?.image}
                              name={share.sharedWith?.name}
                              email={share.sharedWith?.email}
                              size="md"
                            />
                            <div className="truncate">
                              <p className="font-semibold text-text-primary truncate">
                                {share.sharedWith?.name || "User"}
                              </p>
                              <p className="text-text-muted truncate">{share.sharedWith?.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="px-2 py-0.5 rounded-md bg-surface text-brand text-[10px] font-medium uppercase border border-border-subtle">
                              {share.permission}
                            </span>
                            <button
                              onClick={() =>
                                share.sharedWith?.id && handleRevokeShare(share.sharedWith.id)
                              }
                              disabled={!share.sharedWith?.id}
                              className="text-danger hover:text-danger font-medium text-xs hover:underline cursor-pointer"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Blade>
  );
}

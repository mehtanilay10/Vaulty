"use client";

import { useState, useEffect } from "react";
import { X, Folder, Edit3, Trash2, Users, Search, UserPlus, Shield, AlertTriangle, Check, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export function FolderPropertiesModal({
  isOpen,
  onClose,
  folder,
  isOwner,
  onFolderUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  folder: any;
  isOwner: boolean;
  onFolderUpdated?: () => void;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"general" | "sharing">("general");
  const [folderName, setFolderName] = useState(folder?.name || "");
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [shares, setShares] = useState<any[]>(folder?.shares || []);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (folder) {
      setFolderName(folder.name);
      setShares(folder.shares || []);
    }
  }, [folder]);

  useEffect(() => {
    if (userQuery.trim().length >= 2) {
      searchUsers();
    } else {
      setSearchResults([]);
    }
  }, [userQuery]);

  const searchUsers = async () => {
    setLoadingSearch(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(userQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.users || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    try {
      const res = await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName.trim() }),
      });

      if (!res.ok) throw new Error("Failed to rename folder.");

      setSuccessMsg("Folder renamed successfully.");
      if (onFolderUpdated) onFolderUpdated();
    } catch (err: any) {
      setError(err?.message || "Rename failed.");
    }
  };

  const handleDeleteFolder = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folder.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete folder.");

      onClose();
      router.push("/folders");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to delete folder.");
      setIsDeleting(false);
    }
  };

  const handleShareWithUser = async (userId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folder.id}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWithUserId: userId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sharing failed.");

      setUserQuery("");
      setSearchResults([]);
      setSuccessMsg("Folder shared successfully.");
      if (onFolderUpdated) onFolderUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to share folder.");
    }
  };

  const handleRevokeShare = async (userId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/folders/${folder.id}/shares?userId=${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to revoke share.");

      setSuccessMsg("Share access revoked.");
      if (onFolderUpdated) onFolderUpdated();
    } catch (err: any) {
      setError(err?.message || "Revoke failed.");
    }
  };

  if (!isOpen || !folder) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-main/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg bg-bg-surface border border-border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent-primary-soft text-accent-primary">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary truncate max-w-xs">{folder.name}</h2>
              <p className="text-xs text-text-muted">Folder Settings &amp; Permissions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-border-subtle bg-bg-muted px-6">
          <button
            onClick={() => setActiveTab("general")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "general"
                ? "border-accent-primary text-accent-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            General &amp; Actions
          </button>
          <button
            onClick={() => setActiveTab("sharing")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "sharing"
                ? "border-accent-primary text-accent-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Folder Sharing ({shares.length})</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-accent-rose-soft border border-accent-rose/20 text-accent-rose text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-accent-emerald-soft border border-accent-emerald/20 text-accent-emerald text-xs flex items-center gap-2">
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
                    className="vault-input flex-1 px-4 py-2.5 text-sm disabled:opacity-60"
                  />
                  {isOwner && (
                    <button
                      type="submit"
                      className="px-4 py-2.5 rounded-xl vault-btn-primary text-xs cursor-pointer"
                    >
                      Save
                    </button>
                  )}
                </div>
              </form>

              <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle text-xs text-text-secondary space-y-2">
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
                  <span className="text-accent-primary font-semibold uppercase">
                    {isOwner ? "Owner" : "Read Only"}
                  </span>
                </div>
              </div>

              {isOwner && (
                <div className="pt-4 border-t border-border-subtle">
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent-rose-soft hover:bg-accent-rose-soft border border-accent-rose/20 text-accent-rose font-medium text-xs transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Folder &amp; All Contained Files</span>
                    </button>
                  ) : (
                    <div className="p-4 rounded-2xl bg-accent-rose-soft border border-accent-rose/20 space-y-3">
                      <div className="flex items-center gap-2 text-accent-rose font-semibold text-xs">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Confirm Destructive Deletion</span>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-relaxed">
                        Deleting &quot;{folder.name}&quot; will permanently remove this folder, all nested subfolders, and all contained files. This action cannot be undone.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="flex-1 py-2 rounded-xl bg-bg-muted text-text-secondary text-xs font-medium hover:bg-border-subtle transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteFolder}
                          disabled={isDeleting}
                          className="flex-1 py-2 rounded-xl bg-accent-rose hover:bg-accent-rose text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isDeleting ? "Deleting..." : "Permanently Delete"}
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
                <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle text-xs text-text-secondary space-y-1">
                  <p className="font-semibold text-text-primary">Shared Access Notice</p>
                  <p>You have Read-Only access to this folder. Only the folder owner can modify sharing settings.</p>
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
                        className="vault-input w-full pl-10 pr-4 py-2.5 text-sm placeholder:text-text-muted"
                      />
                    </div>

                    {searchResults.length > 0 && (
                      <div className="bg-bg-surface border border-border-subtle rounded-2xl p-2 space-y-1 shadow-xl max-h-48 overflow-y-auto">
                        {searchResults.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between p-2 rounded-xl hover:bg-bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              {u.image ? (
                                <img src={u.image} alt="" className="w-7 h-7 rounded-full" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-accent-primary-soft text-accent-primary font-bold text-xs flex items-center justify-center">
                                  {u.name?.[0] || u.email[0]}
                                </div>
                              )}
                              <div className="truncate text-xs">
                                <p className="font-semibold text-text-primary truncate">{u.name || "User"}</p>
                                <p className="text-text-muted truncate">{u.email}</p>
                              </div>
                            </div>

                            <button
                              onClick={() => handleShareWithUser(u.id)}
                              className="px-3 py-1.5 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white text-xs font-medium flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
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
                            className="flex items-center justify-between p-3 rounded-2xl bg-bg-muted border border-border-subtle text-xs"
                          >
                            <div className="flex items-center gap-3 truncate">
                              {share.sharedWith?.image ? (
                                <img src={share.sharedWith.image} alt="" className="w-8 h-8 rounded-full" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-accent-primary-soft text-accent-primary font-bold text-xs flex items-center justify-center">
                                  {share.sharedWith?.name?.[0] || share.sharedWith?.email?.[0]}
                                </div>
                              )}
                              <div className="truncate">
                                <p className="font-semibold text-text-primary truncate">
                                  {share.sharedWith?.name || "User"}
                                </p>
                                <p className="text-text-muted truncate">{share.sharedWith?.email}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="px-2 py-0.5 rounded-md bg-bg-surface text-accent-primary text-[10px] font-medium uppercase border border-border-subtle">
                                {share.permission}
                              </span>
                              <button
                                onClick={() => handleRevokeShare(share.sharedWith.id)}
                                className="text-accent-rose hover:text-accent-rose font-medium text-xs hover:underline cursor-pointer"
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
      </div>
    </div>
  );
}

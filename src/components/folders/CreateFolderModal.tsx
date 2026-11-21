"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { FolderPlus, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";

export function CreateFolderModal({
  isOpen,
  onClose,
  parentId,
  onFolderCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  parentId?: string | null;
  onFolderCreated?: () => void;
}) {
  const [folderName, setFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setError("Folder name cannot be empty.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: folderName.trim(),
          parentId: parentId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create folder.");
      }

      setFolderName("");
      onClose();
      if (onFolderCreated) onFolderCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create folder.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Create New Folder"
      description="Organize your private documents"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !folderName.trim()}>
            {loading ? (
              "Creating..."
            ) : (
              <>
                <FolderPlus className="w-4 h-4" />
                Create Folder
              </>
            )}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}

        <div>
          <Label className="mb-1.5 block">Folder Name</Label>
          <Input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="e.g. Medical Reports, Government IDs"
            autoFocus
            className="h-10"
          />
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useState, useEffect } from "react";
import { X, FileText, Edit3, Trash2, Tag, Folder, AlertTriangle, Sparkles, Check, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function DocumentPropertiesModal({
  isOpen,
  onClose,
  document,
  folders,
  isOwner,
  onDocumentUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  document: any;
  folders: any[];
  isOwner: boolean;
  onDocumentUpdated?: () => void;
}) {
  const router = useRouter();
  const [docName, setDocName] = useState(document?.name || "");
  const [targetFolderId, setTargetFolderId] = useState(document?.folderId || "");
  const [tagsStr, setTagsStr] = useState(
    document?.tags?.map((t: any) => t.tag.name).join(", ") || ""
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isAiRetrying, setIsAiRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const storageLabel = "Google Drive";

  useEffect(() => {
    if (document) {
      setDocName(document.name);
      setTargetFolderId(document.folderId);
      setTagsStr(document.tags?.map((t: any) => t.tag.name).join(", ") || "");
    }
  }, [document]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const tagsArray = tagsStr
        .split(",")
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);

      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: docName.trim(),
          folderId: targetFolderId,
          tags: tagsArray,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed.");

      setSuccessMsg("Document properties updated successfully.");
      if (onDocumentUpdated) onDocumentUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to update document.");
    }
  };

  const handleRetryAi = async () => {
    setIsAiRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}/ai`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI processing failed to start.");

      setSuccessMsg("AI processing initiated. Refreshing...");
      if (onDocumentUpdated) onDocumentUpdated();
    } catch (err: any) {
      setError(err?.message || "AI retry failed.");
    } finally {
      setIsAiRetrying(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete document.");

      onClose();
      router.push(`/folders/${document.folderId}`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to delete document.");
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={document?.name || "Document Properties"}
      description="Document Properties & Settings"
      footer={
        isOwner ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={handleUpdate}>
              Save Changes
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {error && (
          <Alert variant="danger">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </Alert>
        )}

        {!isOwner ? (
          <Card>
            <p className="text-xs text-text-secondary">You are viewing a shared document. Only the owner can rename, move, re-tag, or delete this file.</p>
          </Card>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <Label>Document Name</Label>
              <Input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
              />
            </div>

            <div>
              <Label>Folder Location</Label>
              <Select
                value={targetFolderId}
                onChange={(e) => setTargetFolderId(e.target.value)}
                className="w-full"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Tags (Comma separated)</Label>
              <Input
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="e.g. medical, prescription, 2026"
              />
            </div>
          </form>
        )}

        {isOwner && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-brand font-semibold text-xs">
                <Sparkles className="w-4 h-4" />
                <span>Gemini AI Processing</span>
              </div>
              <Badge variant="info" className="text-[10px]">
                {document.aiProcessing?.status || "NOT_REQUESTED"}
              </Badge>
            </div>

            <p className="text-[11px] text-text-muted mb-3">
              Trigger or re-run Gemini AI document analysis to generate structured summaries and text extraction.
            </p>

            <Button
              onClick={handleRetryAi}
              disabled={isAiRetrying}
              className="w-full"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAiRetrying ? "animate-spin" : ""}`} />
              <span>
                {document.aiProcessing?.status === "FAILED"
                  ? "Retry Failed AI Processing"
                  : "Re-run Gemini AI Analysis"}
              </span>
            </Button>
          </Card>
        )}

        {isOwner && (
          <div className="pt-4 border-t border-border-subtle">
            {!confirmDelete ? (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="w-full">
                <Trash2 className="w-4 h-4" />
                Delete Document
              </Button>
            ) : (
              <Card className="bg-danger-subtle border-danger/20">
                <div className="flex items-center gap-2 text-danger font-semibold text-xs mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Confirm Document Deletion</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed mb-3">
                  Are you sure you want to delete &quot;{document.name}&quot;? The file will be permanently removed from {storageLabel}.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={handleDelete} disabled={isDeleting} className="flex-1">
                    {isDeleting ? "Deleting..." : "Permanently Delete"}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

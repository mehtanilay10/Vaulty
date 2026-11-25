"use client";

import { useState, useEffect } from "react";
import { Trash2, AlertTriangle, Check, Sparkles, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Blade } from "@/components/ui/Blade";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MultiSelectPills, type MultiSelectOption } from "@/components/ui/MultiSelectPills";
import { FolderTreeSelect } from "@/components/ui/FolderTreeSelect";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DocumentWithRelations } from "@/types";

const DOCUMENT_TAG_SUGGESTIONS: MultiSelectOption[] = [
  { value: "identity", label: "Identity" },
  { value: "finance", label: "Finance" },
  { value: "taxes", label: "Taxes" },
  { value: "medical", label: "Medical" },
  { value: "insurance", label: "Insurance" },
  { value: "legal", label: "Legal" },
  { value: "receipt", label: "Receipt" },
  { value: "personal", label: "Personal" },
];

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
  document: DocumentWithRelations | null;
  folders: { id: string; name: string; parentId?: string | null }[];
  isOwner: boolean;
  onDocumentUpdated?: () => void;
}) {
  const router = useRouter();
  const [docName, setDocName] = useState(document?.name || "");
  const [targetFolderId, setTargetFolderId] = useState(document?.folderId || "");
  const [expiryDate, setExpiryDate] = useState(
    document?.expiryDate ? new Date(document.expiryDate).toISOString().slice(0, 10) : "",
  );
  const [tags, setTags] = useState<string[]>(document?.tags.map((t) => t.tag.name) || []);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isAiRetrying, setIsAiRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const storageLabel = "Google Drive";

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (document) {
      setDocName(document.name);
      setTargetFolderId(document.folderId || "");
      setTags((document.tags || []).map((t) => t.tag?.name).filter(Boolean) as string[]);
      setExpiryDate(() => {
        if (!document.expiryDate) return "";
        try {
          const d = new Date(document.expiryDate);
          return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
        } catch {
          return "";
        }
      });
    }
  }, [document]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!document) {
    return null;
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const tagsArray = tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);

      const res = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: docName.trim(),
          folderId: targetFolderId,
          tags: tagsArray,
          expiryDate: expiryDate || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed.");

      setSuccessMsg("Document properties updated successfully.");
      if (onDocumentUpdated) onDocumentUpdated();
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update document.";
      setError(message);
    }
  };

  const handleRetryAi = async () => {
    setIsAiRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}/ai`, {
        method: "POST",
        headers: csrfHeaders(),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI processing failed to start.");

      setSuccessMsg("AI processing initiated. Refreshing...");
      if (onDocumentUpdated) onDocumentUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI retry failed.";
      setError(message);
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
        headers: csrfHeaders(),
      });

      if (!res.ok) throw new Error("Failed to delete document.");

      onClose();
      if (document.folderId) {
        router.push(`/folders/${document.folderId}`);
      } else {
        router.push("/documents");
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete document.";
      setError(message);
      setIsDeleting(false);
    }
  };

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title={document?.name || "Document Properties"}
      description="Document Properties & Settings"
      size="lg"
      footer={
        isOwner ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              <X className="w-4 h-4" />
              Close
            </Button>
            <Button onClick={handleUpdate}>
              <Check className="w-4 h-4" />
              Save Changes
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            <X className="w-4 h-4" />
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
            <p className="text-xs text-text-secondary">
              You are viewing a shared document. Only the owner can rename, move, re-tag, or delete
              this file.
            </p>
          </Card>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <Label>Document Name</Label>
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} />
            </div>

            <div>
              <Label>Folder Location</Label>
              <FolderTreeSelect
                folders={folders}
                value={targetFolderId}
                onChange={setTargetFolderId}
                placeholder="Select destination folder..."
              />
            </div>

            <div>
              <Label>Expiry date (optional)</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-text-muted">
                Vaulty uses this date to show upcoming expiry alerts and send reminders.
              </p>
            </div>

            <div>
              <Label className="mb-1.5 block">Tags</Label>
              <MultiSelectPills
                options={DOCUMENT_TAG_SUGGESTIONS}
                value={tags}
                onChange={(vals) => setTags(vals as string[])}
                allowCustom
                placeholder="Select or type tags and press Enter..."
              />
              <p className="mt-1 text-[11px] text-text-muted">
                Pick from suggestions or type custom tags and press Enter or comma.
              </p>
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
              Trigger or re-run Gemini AI document analysis to generate structured summaries and
              text extraction.
            </p>

            <Button onClick={handleRetryAi} disabled={isAiRetrying} className="w-full">
              <RefreshCw className={`w-3.5 h-3.5 ${isAiRetrying ? "animate-spin" : ""}`} />
              <span>
                {document.aiProcessing?.status === "FAILED"
                  ? "Retry Failed AI Processing"
                  : document.aiProcessing?.status
                    ? "Re-run Gemini AI Analysis"
                    : "Enable AI Processing"}
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
                  Are you sure you want to delete &quot;{document.name}&quot;? The file will be
                  permanently removed from {storageLabel}.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1"
                  >
                    {isDeleting ? (
                      "Deleting..."
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Permanently Delete
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </Blade>
  );
}

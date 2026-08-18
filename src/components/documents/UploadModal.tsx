"use client";

import { useState, useEffect } from "react";
import { X, Upload, FileText, Sparkles, Folder, Tag, AlertCircle, Camera, Check, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

interface FolderOption {
  id: string;
  name: string;
}

export function UploadModal({
  isOpen,
  onClose,
  initialFolderId,
  onUploadSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialFolderId?: string;
  onUploadSuccess?: () => void;
}) {
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId || "");
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [tags, setTags] = useState("");
  const [generateAi, setGenerateAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageProvider, setStorageProvider] = useState<"GOOGLE_DRIVE" | "VERCEL_BLOB">("GOOGLE_DRIVE");

  useEffect(() => {
    if (isOpen) {
      fetchFolders();
      fetchDefaultProvider();
    }
  }, [isOpen]);

  const fetchDefaultProvider = async () => {
    try {
      const res = await fetch("/api/user/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.defaultStorageProvider) {
          setStorageProvider(data.defaultStorageProvider);
        }
      }
    } catch (err) {
      console.error("Failed to fetch default provider:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFolders();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialFolderId) {
      setSelectedFolderId(initialFolderId);
    }
  }, [initialFolderId]);

  const fetchFolders = async () => {
    try {
      const res = await fetch("/api/folders");
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
        if (!selectedFolderId && data.folders?.length > 0) {
          setSelectedFolderId(data.folders[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching folders:", err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!docName) {
        setDocName(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    if (!selectedFolderId) {
      setError("Please select a folder.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folderId", selectedFolderId);
      formData.append("name", docName || file.name);
      formData.append("tags", tags);
      formData.append("generateAi", String(generateAi));

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setFile(null);
      setDocName("");
      setTags("");
      onClose();
      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      setError(err?.message || "Failed to upload document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Upload Document"
      description="Add PDF or images to your private vault"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !file || !selectedFolderId}>
            {loading ? "Uploading to Vault..." : "Upload Document"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <Alert variant="danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </Alert>
        )}

        <div>
          <Label>Select Document (PDF, JPEG, PNG, WebP)</Label>
          <div className="relative border-2 border-dashed border-border-subtle hover:border-brand/50 rounded-lg p-6 text-center transition-colors bg-surface-muted cursor-pointer">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 text-brand" />
              {file ? (
                <div className="text-sm font-semibold text-success truncate max-w-full">
                  ✓ {file.name} ({Math.round(file.size / 1024)} KB)
                </div>
              ) : (
                <>
                  <p className="text-sm text-text-secondary font-medium">
                    Click or drag file to upload
                  </p>
                  <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                    <span>PDF, JPG, PNG up to 50MB</span>
                    <span className="inline-flex items-center gap-1 text-text-secondary bg-surface px-2 py-0.5 rounded-md border border-border-subtle">
                      <Camera className="w-3 h-3" /> Camera supported
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div>
          <Label>Document Display Name</Label>
          <Input
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="e.g. Blood Test Report Aug 2026"
            className="w-full"
          />
        </div>

        <div>
          <Label>Destination Folder</Label>
          <Select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            className="w-full"
          >
            {folders.length === 0 ? (
              <option value="">No folders found. Create one first.</option>
            ) : (
              folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))
            )}
          </Select>
        </div>

        <div>
          <Label>Tags (Comma separated)</Label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. medical, blood-test, 2026"
            className="w-full"
          />
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-brand shrink-0" />
              <div>
                <p className="text-xs font-semibold text-text-primary">Storage Provider</p>
                <p className="text-[11px] text-text-muted">
                  {storageProvider === "GOOGLE_DRIVE" ? "Google Drive" : "Vercel Blob"}
                </p>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold text-brand px-2 py-0.5 rounded bg-brand-subtle border border-brand/20">
              {storageProvider === "GOOGLE_DRIVE" ? "Drive" : "Blob"}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-brand shrink-0" />
              <div>
                <p className="text-xs font-semibold text-text-primary">Generate Gemini AI Summary</p>
                <p className="text-[11px] text-text-muted">OCR extraction, structured summary & interpretation</p>
              </div>
            </div>
            <Checkbox
              checked={generateAi}
              onChange={(e) => setGenerateAi(e.target.checked)}
            />
          </div>
        </Card>
      </form>
    </Modal>
  );
}

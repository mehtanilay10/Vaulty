/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  FileText,
  Sparkles,
  AlertCircle,
  Camera,
  FolderPlus,
  Upload as UploadIcon,
  X,
} from "lucide-react";

const CameraScanModal = dynamic(
  () => import("@/components/documents/CameraScanModal").then((mod) => mod.CameraScanModal),
  { ssr: false },
);
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";
import { Blade } from "@/components/ui/Blade";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { MultiSelectPills, type MultiSelectOption } from "@/components/ui/MultiSelectPills";
import { buildFolderTree } from "@/lib/folders/folder-tree";

interface FolderOption {
  id: string;
  name: string;
  parentId?: string | null;
}

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

const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

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
  const [tags, setTags] = useState<string[]>([]);
  const [expiryDate, setExpiryDate] = useState("");
  const [generateAi, setGenerateAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "create">("select");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCameraScanOpen, setIsCameraScanOpen] = useState(false);

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);

  useEffect(() => {
    if (isOpen) {
      fetchFolders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialFolderId) {
      setSelectedFolderId(initialFolderId);
    }
  }, [initialFolderId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function fetchFolders() {
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
  }

  const acceptFile = (selectedFile?: File) => {
    if (!selectedFile) return;
    const valid = /\.(pdf|jpe?g|png|webp)$/i.test(selectedFile.name);
    if (!valid) {
      setError("Choose a PDF, JPEG, PNG or WebP file.");
      return;
    }
    setFile(selectedFile);
    if (!docName) setDocName(selectedFile.name.replace(/\.[^/.]+$/, ""));
    setError(null);
    setUploadProgress(0);
    generateThumbnail(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    acceptFile(e.target.files?.[0]);

  const generateThumbnail = async (file: File) => {
    if (file.type.startsWith("image/")) {
      const dataUrl = await createImageThumbnail(file);
      setThumbnailDataUrl(dataUrl);
    } else if (file.type === "application/pdf") {
      setThumbnailDataUrl(createPdfPlaceholder(file.name));
    } else {
      setThumbnailDataUrl(null);
    }
  };

  const createImageThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const size = 200;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas not supported"));
          ctx.fillStyle = "#f5f5f5";
          ctx.fillRect(0, 0, size, size);
          const scale = Math.min(size / img.width, size / img.height);
          const x = (size - img.width * scale) / 2;
          const y = (size - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const createPdfPlaceholder = (filename: string): string => {
    const firstLetter = filename.charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#f5f5f5"/>
      <rect x="20" y="20" width="160" height="160" rx="8" fill="#fff" stroke="#e5e5e5" stroke-width="1"/>
      <text x="100" y="110" font-family="system-ui" font-size="80" font-weight="600" fill="#666" text-anchor="middle">${firstLetter}</text>
    </svg>`;
    return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    setError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create folder.");
      await fetchFolders();
      setSelectedFolderId(data.folder.id);
      setMode("select");
      setNewFolderName("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create folder.";
      setError(message);
      setUploadProgress(0);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    if (!selectedFolderId) {
      setError("Please select or create a folder.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folderId", selectedFolderId);
      formData.append("name", docName || file.name);
      formData.append("tags", tags.join(","));
      if (expiryDate) formData.append("expiryDate", expiryDate);
      formData.append("generateAi", String(generateAi));
      if (thumbnailDataUrl) {
        formData.append("thumbnail", thumbnailDataUrl);
      }

      await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/documents/upload");
        xhr.withCredentials = true;
        xhr.timeout = UPLOAD_TIMEOUT_MS;
        Object.entries(csrfHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onerror = () =>
          reject(
            new Error(
              "Network error while uploading. Your file is still selected; retry when connected.",
            ),
          );
        xhr.ontimeout = () =>
          reject(
            new Error(
              "Upload timed out. Your file is still selected; check your connection and try again.",
            ),
          );
        xhr.onabort = () =>
          reject(new Error("Upload was cancelled before it completed. Please try again."));
        xhr.onload = () => {
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(xhr.responseText);
          } catch {
            /* non-JSON error */
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
          else
            reject(new Error(typeof payload.error === "string" ? payload.error : "Upload failed."));
        };
        xhr.send(formData);
      });

      setFile(null);
      setDocName("");
      setTags([]);
      setExpiryDate("");
      setSelectedFolderId("");
      setMode("select");
      setNewFolderName("");
      setThumbnailDataUrl(null);
      setUploadProgress(0);
      onClose();
      if (onUploadSuccess) onUploadSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setDocName("");
    setTags([]);
    setExpiryDate("");
    setSelectedFolderId(initialFolderId || "");
    setMode("select");
    setNewFolderName("");
    setThumbnailDataUrl(null);
    setUploadProgress(0);
    setIsDragging(false);
    setError(null);
    onClose();
  };

  return (
    <Blade
      open={isOpen}
      onClose={handleClose}
      title="Upload Document"
      description="Add PDF or images to your private vault"
      icon={<UploadIcon className="h-4 w-4" />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !file || !selectedFolderId}>
            {loading ? (
              "Uploading to Vault..."
            ) : (
              <>
                <UploadIcon className="w-4 h-4" />
                Upload Document
              </>
            )}
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
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              acceptFile(event.dataTransfer.files?.[0]);
            }}
            className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${isDragging ? "border-brand bg-brand-subtle" : "border-border-subtle hover:border-brand/50 bg-surface-muted"}`}
          >
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center gap-2">
              {thumbnailDataUrl ? (
                <img
                  src={thumbnailDataUrl}
                  alt="Thumbnail preview"
                  className="w-24 h-24 object-cover rounded-md border border-border-subtle"
                />
              ) : (
                <FileText className="w-8 h-8 text-brand" />
              )}
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
          <div className="mt-2.5 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCameraScanOpen(true)}
              className="gap-1.5"
            >
              <Camera className="w-3.5 h-3.5 text-brand" />
              <span>Scan with Camera (Auto-crop & compress)</span>
            </Button>
          </div>
          {loading && (
            <div className="mt-2 space-y-1" role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-text-muted">Uploading… {uploadProgress}%</p>
            </div>
          )}
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
          {mode === "select" ? (
            <div className="space-y-2">
              <Select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full text-xs font-mono"
              >
                {folderTree.length === 0 ? (
                  <option value="">No folders found. Create one below.</option>
                ) : (
                  folderTree.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.treeLabel}
                    </option>
                  ))
                )}
              </Select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMode("create")}
                className="w-full"
              >
                <FolderPlus className="w-4 h-4" />
                Create New Folder
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder name"
                className="w-full"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setMode("select");
                    setNewFolderName("");
                  }}
                  className="flex-1"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="flex-1"
                >
                  {creatingFolder ? (
                    "Creating..."
                  ) : (
                    <>
                      <FolderPlus className="w-4 h-4" />
                      Create Folder
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div>
          <Label>Expiry date (optional)</Label>
          <Input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full"
          />
          <p className="mt-1 text-[11px] text-text-muted">
            Add an expiry date for passports, licences, insurance policies and other time-sensitive
            documents. Vaulty can remind you before it expires.
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

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-brand shrink-0" />
              <div>
                <p className="text-xs font-semibold text-text-primary">
                  Generate Gemini AI Summary
                </p>
                <p className="text-[11px] text-text-muted">
                  OCR extraction, structured summary & interpretation
                </p>
              </div>
            </div>
            <Checkbox checked={generateAi} onChange={(e) => setGenerateAi(e.target.checked)} />
          </div>
        </Card>
      </form>

      <CameraScanModal
        isOpen={isCameraScanOpen}
        onClose={() => setIsCameraScanOpen(false)}
        initialFolderId={selectedFolderId}
        onScanComplete={(scannedFile) => {
          acceptFile(scannedFile);
          setIsCameraScanOpen(false);
        }}
      />
    </Blade>
  );
}

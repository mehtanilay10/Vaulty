/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Camera,
  RotateCw,
  Check,
  AlertCircle,
  Upload,
  ArrowLeft,
  X,
  FileCheck,
  Sparkles,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Checkbox } from "@/components/ui/Checkbox";
import { Alert } from "@/components/ui/Alert";
import { Blade } from "@/components/ui/Blade";
import { MultiSelectPills, type MultiSelectOption } from "@/components/ui/MultiSelectPills";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  type QuadPoints,
  type ScanFilter,
  calculateOutputDimensions,
  detectDefaultQuad,
  detectDocumentQuad,
  warpImageData,
  rotateCanvas,
  compressCanvasToBlob,
  generateThumbnailDataUrl,
} from "@/lib/scanner/perspective";
import { stitchBlobsToPdf } from "@/lib/scanner/pdf-stitcher";

interface FolderOption {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface ScannedPage {
  id: string;
  blob: Blob;
  thumbnail: string;
  previewUrl: string;
  size: number;
  originalSize: number;
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

type Step = "capture" | "crop" | "review";

interface AspectPreset {
  id: string;
  label: string;
  ratio: number | null; // height / width
}

const ASPECT_PRESETS: AspectPreset[] = [
  { id: "free", label: "Free Quad", ratio: null },
  { id: "a4", label: "A4 / Doc", ratio: 1.4142 },
  { id: "id", label: "ID Card", ratio: 0.63 },
  { id: "square", label: "1:1", ratio: 1.0 },
];

export function CameraScanModal({
  isOpen,
  onClose,
  initialFolderId,
  targetDocumentId,
  targetDocumentName,
  onScanComplete,
  onAppendComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialFolderId?: string;
  targetDocumentId?: string;
  targetDocumentName?: string;
  onScanComplete?: (file: File) => void;
  onAppendComplete?: () => void;
}) {
  const [step, setStep] = useState<Step>("capture");
  const [filter, setFilter] = useState<ScanFilter>("document");

  const getLiveFilterStyle = (f: ScanFilter) => {
    switch (f) {
      case "grayscale":
        return "grayscale(100%) contrast(125%)";
      case "document":
        return "grayscale(25%) contrast(175%) brightness(115%)";
      case "color":
      default:
        return "none";
    }
  };

  const autoDetectCornersForImage = (img: HTMLImageElement) => {
    try {
      const maxDim = 320;
      const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        const smallData = ctx.getImageData(0, 0, w, h);
        const detected = detectDocumentQuad(smallData, img.naturalWidth, img.naturalHeight);
        setCorners({
          topLeft: {
            x: detected.topLeft.x / img.naturalWidth,
            y: detected.topLeft.y / img.naturalHeight,
          },
          topRight: {
            x: detected.topRight.x / img.naturalWidth,
            y: detected.topRight.y / img.naturalHeight,
          },
          bottomRight: {
            x: detected.bottomRight.x / img.naturalWidth,
            y: detected.bottomRight.y / img.naturalHeight,
          },
          bottomLeft: {
            x: detected.bottomLeft.x / img.naturalWidth,
            y: detected.bottomLeft.y / img.naturalHeight,
          },
        });
        return;
      }
    } catch (err) {
      console.warn("Auto document corner detection failed, using fallback:", err);
    }

    const defaultQuad = detectDefaultQuad(img.naturalWidth, img.naturalHeight, 0.05);
    setCorners({
      topLeft: {
        x: defaultQuad.topLeft.x / img.naturalWidth,
        y: defaultQuad.topLeft.y / img.naturalHeight,
      },
      topRight: {
        x: defaultQuad.topRight.x / img.naturalWidth,
        y: defaultQuad.topRight.y / img.naturalHeight,
      },
      bottomRight: {
        x: defaultQuad.bottomRight.x / img.naturalWidth,
        y: defaultQuad.bottomRight.y / img.naturalHeight,
      },
      bottomLeft: {
        x: defaultQuad.bottomLeft.x / img.naturalWidth,
        y: defaultQuad.bottomLeft.y / img.naturalHeight,
      },
    });
  };
  const [error, setError] = useState<string | null>(null);

  // Multi-page stack
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activeReviewPageIndex, setActiveReviewPageIndex] = useState<number>(0);
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);

  // Raw captured image for the current page being scanned
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [rawImageDims, setRawImageDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [originalFileSize, setOriginalFileSize] = useState<number>(0);

  // Crop configuration (stored in normalized coordinates 0..1)
  const [corners, setCorners] = useState<QuadPoints>({
    topLeft: { x: 0.05, y: 0.05 },
    topRight: { x: 0.95, y: 0.05 },
    bottomRight: { x: 0.95, y: 0.95 },
    bottomLeft: { x: 0.05, y: 0.95 },
  });
  const [activeCorner, setActiveCorner] = useState<keyof QuadPoints | null>(null);
  const [aspectPreset, setAspectPreset] = useState<string>("free");
  const [rotationDegrees, setRotationDegrees] = useState<0 | 90 | 180 | 270>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Upload metadata
  const [docName, setDocName] = useState("");
  const [tags, setTags] = useState<string[]>(["receipt"]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId || "");
  const [expiryDate, setExpiryDate] = useState("");
  const [generateAi, setGenerateAi] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);

  // Fetch folders when modal opens
  useEffect(() => {
    if (isOpen && !targetDocumentId) {
      fetch("/api/folders")
        .then((res) => res.json())
        .then((data) => {
          setFolders(data.folders || []);
          if (!selectedFolderId && data.folders?.length > 0) {
            setSelectedFolderId(data.folders[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, selectedFolderId, targetDocumentId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialFolderId) {
      setSelectedFolderId(initialFolderId);
    }
  }, [initialFolderId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-trigger camera file picker on initial open if in capture step
  useEffect(() => {
    if (isOpen && step === "capture" && !rawImageSrc) {
      const timer = setTimeout(() => {
        fileInputRef.current?.click();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, step, rawImageSrc]);

  // Note: previewUrls are now base64 data URLs generated from outputCanvas,
  // ensuring previews never break due to premature URL.revokeObjectURL calls.

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }

    setOriginalFileSize(selectedFile.size);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setRawImageSrc(src);
        setRawImageDims({ width: img.naturalWidth, height: img.naturalHeight });
        // Auto-detect document bounding corners like Lens/Google Scan
        autoDetectCornersForImage(img);

        // Set default document name if not already set
        if (!docName) {
          const now = new Date();
          const dateStr = now.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const timeStr = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          setDocName(`Scan ${dateStr} ${timeStr}`);
        }
        setStep("crop");
      };
      img.onerror = () => {
        setError("Failed to load camera image. Please try again.");
      };
      img.src = src;
    };
    reader.onerror = () => {
      setError("Failed to read image file.");
    };
    reader.readAsDataURL(selectedFile);
  };

  // Dragging corner points
  const handlePointerDown = (corner: keyof QuadPoints, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(corner);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeCorner || !cropContainerRef.current) return;
    const rect = cropContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setCorners((prev) => ({
      ...prev,
      [activeCorner]: { x, y },
    }));
    setAspectPreset("free");
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCorner) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
      setActiveCorner(null);
    }
  };

  // Keyboard navigation for corner pins
  const handleKeyDown = (corner: keyof QuadPoints, e: React.KeyboardEvent) => {
    const stepSize = e.shiftKey ? 0.05 : 0.01;
    let dx = 0;
    let dy = 0;

    if (e.key === "ArrowLeft") dx = -stepSize;
    else if (e.key === "ArrowRight") dx = stepSize;
    else if (e.key === "ArrowUp") dy = -stepSize;
    else if (e.key === "ArrowDown") dy = stepSize;
    else return;

    e.preventDefault();
    setCorners((prev) => ({
      ...prev,
      [corner]: {
        x: Math.max(0, Math.min(1, prev[corner].x + dx)),
        y: Math.max(0, Math.min(1, prev[corner].y + dy)),
      },
    }));
    setAspectPreset("free");
  };

  // Reset corners to 5% inset
  const handleResetCorners = () => {
    setCorners({
      topLeft: { x: 0.05, y: 0.05 },
      topRight: { x: 0.95, y: 0.05 },
      bottomRight: { x: 0.95, y: 0.95 },
      bottomLeft: { x: 0.05, y: 0.95 },
    });
    setAspectPreset("free");
  };

  // Apply preset aspect ratio to crop quad in real-time
  const applyAspectPreset = (presetId: string) => {
    setAspectPreset(presetId);
    if (!rawImageDims.width || !rawImageDims.height) return;

    if (presetId === "free") {
      handleResetCorners();
      return;
    }

    const preset = ASPECT_PRESETS.find((p) => p.id === presetId);
    if (!preset || !preset.ratio) return;

    const nw = rawImageDims.width;
    const nh = rawImageDims.height;
    const targetHOverW = preset.ratio;
    const imageHOverW = nh / nw;

    let normW = 0.84;
    let normH = normW * (targetHOverW / imageHOverW);

    if (normH > 0.9) {
      normH = 0.9;
      normW = normH * (imageHOverW / targetHOverW);
    }
    if (normW > 0.92) {
      normW = 0.92;
      normH = normW * (targetHOverW / imageHOverW);
    }

    const xOffset = Math.max(0.02, (1 - normW) / 2);
    const yOffset = Math.max(0.02, (1 - normH) / 2);

    setCorners({
      topLeft: { x: xOffset, y: yOffset },
      topRight: { x: xOffset + normW, y: yOffset },
      bottomRight: { x: xOffset + normW, y: yOffset + normH },
      bottomLeft: { x: xOffset, y: yOffset + normH },
    });
  };

  // Drag and drop page reordering in Review & Upload
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedPageIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedPageIndex === null || draggedPageIndex === targetIndex) return;

    setPages((prev) => {
      const copy = [...prev];
      const [movedPage] = copy.splice(draggedPageIndex, 1);
      copy.splice(targetIndex, 0, movedPage);
      return copy;
    });

    setActiveReviewPageIndex(targetIndex);
    setDraggedPageIndex(null);
  };

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    setRotationDegrees((prev) => {
      const next = (prev + 90) % 360;
      return next as 0 | 90 | 180 | 270;
    });
  };

  // Process current page from canvas
  const processCurrentPage = async (): Promise<ScannedPage | null> => {
    if (!rawImageSrc || !imageElementRef.current) return null;

    const img = imageElementRef.current;
    const nw = rawImageDims.width;
    const nh = rawImageDims.height;

    const pixelQuad: QuadPoints = {
      topLeft: { x: corners.topLeft.x * nw, y: corners.topLeft.y * nh },
      topRight: { x: corners.topRight.x * nw, y: corners.topRight.y * nh },
      bottomRight: { x: corners.bottomRight.x * nw, y: corners.bottomRight.y * nh },
      bottomLeft: { x: corners.bottomLeft.x * nw, y: corners.bottomLeft.y * nh },
    };

    const selectedPreset = ASPECT_PRESETS.find((p) => p.id === aspectPreset);
    const ratio = selectedPreset?.ratio ?? null;

    const { width: dstW, height: dstH } = calculateOutputDimensions(pixelQuad, ratio, 2048);

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = nw;
    srcCanvas.height = nh;
    const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
    if (!srcCtx) throw new Error("Canvas 2D context unavailable");
    srcCtx.drawImage(img, 0, 0, nw, nh);
    const srcData = srcCtx.getImageData(0, 0, nw, nh);

    const warpedData = warpImageData(srcData, pixelQuad, dstW, dstH, filter);

    let outputCanvas = document.createElement("canvas");
    outputCanvas.width = dstW;
    outputCanvas.height = dstH;
    const outputCtx = outputCanvas.getContext("2d");
    if (!outputCtx) throw new Error("Canvas context unavailable");
    outputCtx.putImageData(warpedData, 0, 0);

    if (rotationDegrees !== 0) {
      outputCanvas = rotateCanvas(outputCanvas, rotationDegrees);
    }

    const thumb = generateThumbnailDataUrl(outputCanvas, 200);
    const compressedBlob = await compressCanvasToBlob(outputCanvas, "image/jpeg", 0.85);
    const newPreviewUrl = outputCanvas.toDataURL("image/jpeg", 0.85);

    return {
      id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      blob: compressedBlob,
      thumbnail: thumb,
      previewUrl: newPreviewUrl,
      size: compressedBlob.size,
      originalSize: originalFileSize || compressedBlob.size,
    };
  };

  // Add next page
  const handleAddNextPage = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const page = await processCurrentPage();
      if (page) {
        setPages((prev) => [...prev, page]);
        setActiveReviewPageIndex(pages.length);
        setRawImageSrc(null);
        setStep("capture");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error("Error adding page:", err);
      setError("Failed to process current page. Please adjust crop and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Finish current page and go to review
  const handleFinishAndReview = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const page = await processCurrentPage();
      if (page) {
        setPages((prev) => {
          const next = [...prev, page];
          setActiveReviewPageIndex(next.length - 1);
          return next;
        });
        setRawImageSrc(null);
        setStep("review");
      }
    } catch (err) {
      console.error("Error processing document:", err);
      setError("Failed to process document crop. Please adjust corners and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Reorder pages in review
  const handleMovePage = (index: number, direction: "left" | "right") => {
    const targetIdx = direction === "left" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= pages.length) return;

    setPages((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
    setActiveReviewPageIndex(targetIdx);
  };

  // Delete page in review
  const handleDeletePage = (index: number) => {
    if (pages.length <= 1) {
      setPages([]);
      setRawImageSrc(null);
      setStep("capture");
      return;
    }
    const pageToDelete = pages[index];
    if (pageToDelete?.previewUrl) URL.revokeObjectURL(pageToDelete.previewUrl);

    setPages((prev) => prev.filter((_, i) => i !== index));
    setActiveReviewPageIndex((prev) => (prev >= pages.length - 1 ? pages.length - 2 : prev));
  };

  // Upload or append to Google Drive
  const handleUploadOrAppend = async () => {
    if (pages.length === 0) {
      setError("No scanned pages available to save.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // If targetDocumentId is provided: APPEND mode
      if (targetDocumentId) {
        let fileToUpload: File;
        if (pages.length === 1) {
          fileToUpload = new File([pages[0].blob], "appended-page.jpg", {
            type: "image/jpeg",
          });
        } else {
          const pdfBlob = await stitchBlobsToPdf(pages.map((p) => p.blob));
          fileToUpload = new File([pdfBlob], "appended-pages.pdf", {
            type: "application/pdf",
          });
        }

        const formData = new FormData();
        formData.append("file", fileToUpload);

        const res = await fetch(`/api/documents/${targetDocumentId}/append-page`, {
          method: "POST",
          headers: csrfHeaders(),
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to append page to document.");
        }

        if (onAppendComplete) onAppendComplete();
        handleClose();
        window.dispatchEvent(new CustomEvent("vaulty-document-uploaded"));
        return;
      }

      // NEW DOCUMENT UPLOAD
      if (!selectedFolderId) {
        setError("Please select a target folder.");
        setIsUploading(false);
        return;
      }

      let uploadFile: File;
      const isMultiPage = pages.length > 1;

      if (isMultiPage) {
        const stitchedPdfBlob = await stitchBlobsToPdf(pages.map((p) => p.blob));
        const pdfFileName = `${docName.trim().replace(/[/\\?%*:|"<>]/g, "-") || "Scan"}.pdf`;
        uploadFile = new File([stitchedPdfBlob], pdfFileName, { type: "application/pdf" });
      } else {
        const jpgFileName = `${docName.trim().replace(/[/\\?%*:|"<>]/g, "-") || "Scan"}.jpg`;
        uploadFile = new File([pages[0].blob], jpgFileName, { type: "image/jpeg" });
      }

      if (onScanComplete) {
        onScanComplete(uploadFile);
      }

      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("folderId", selectedFolderId);
      formData.append("name", docName || uploadFile.name.replace(/\.[^/.]+$/, ""));
      formData.append("tags", tags.join(","));
      if (expiryDate) formData.append("expiryDate", expiryDate);
      formData.append("generateAi", String(generateAi));
      if (pages[0]?.thumbnail) {
        formData.append("thumbnail", pages[0].thumbnail);
      }

      await new Promise<Record<string, unknown>>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/documents/upload");
        xhr.withCredentials = true;
        xhr.timeout = 5 * 60 * 1000;
        Object.entries(csrfHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload. Please retry."));
        xhr.ontimeout = () => reject(new Error("Upload timed out. Check your connection."));
        xhr.onload = () => {
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(xhr.responseText);
          } catch {
            /* ignore non-json */
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
          else
            reject(new Error(typeof payload.error === "string" ? payload.error : "Upload failed."));
        };
        xhr.send(formData);
      });

      handleClose();
      window.dispatchEvent(new CustomEvent("vaulty-document-uploaded"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setStep("capture");
    setRawImageSrc(null);
    pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPages([]);
    setActiveReviewPageIndex(0);
    setOriginalFileSize(0);
    setError(null);
    setRotationDegrees(0);
    setUploadProgress(0);
    onClose();
  };

  const totalSize = useMemo(() => {
    return pages.reduce((sum, p) => sum + p.size, 0);
  }, [pages]);

  const totalOriginalSize = useMemo(() => {
    return pages.reduce((sum, p) => sum + p.originalSize, 0);
  }, [pages]);

  const savingsPct = useMemo(() => {
    if (!totalOriginalSize || !totalSize) return null;
    const diff = totalOriginalSize - totalSize;
    if (diff <= 0) return 0;
    return Math.round((diff / totalOriginalSize) * 100);
  }, [totalOriginalSize, totalSize]);

  return (
    <Blade
      open={isOpen}
      onClose={handleClose}
      size="xl"
      title={
        targetDocumentId
          ? targetDocumentName
            ? `Add Pages to "${targetDocumentName}"`
            : "Add Pages to Document"
          : step === "capture"
            ? pages.length > 0
              ? `Scan Page ${pages.length + 1}`
              : "Scan Document"
            : step === "crop"
              ? pages.length > 0
                ? `Crop Page ${pages.length + 1}`
                : "Adjust & Crop Document"
              : `Review & Upload (${pages.length} ${pages.length === 1 ? "page" : "pages"})`
      }
      description={
        targetDocumentId
          ? "Scan pages to append to this document and automatically refresh AI extraction"
          : step === "capture"
            ? "Capture with camera for perspective correction & multi-page PDF stitching"
            : step === "crop"
              ? "Align corners and orientation for this page"
              : pages.length > 1
                ? "Pages will be automatically stitched into a single compressed PDF"
                : "Automatic compression ready for Google Drive storage"
      }
      footer={
        step === "crop" ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setRawImageSrc(null);
                setStep("capture");
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Retake
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="secondary"
                type="button"
                onClick={handleAddNextPage}
                disabled={isProcessing}
                className="gap-1.5"
              >
                <Plus className="w-4 h-4 text-brand" />
                <span>Add Next Page</span>
              </Button>
              <Button type="button" onClick={handleFinishAndReview} disabled={isProcessing}>
                {isProcessing ? (
                  "Processing..."
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Review & Finish
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : step === "review" ? (
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setRawImageSrc(null);
                setStep("capture");
              }}
              disabled={isUploading}
            >
              <Plus className="w-4 h-4" />
              Add More Pages
            </Button>
            <Button
              type="button"
              onClick={handleUploadOrAppend}
              disabled={isUploading || (!targetDocumentId && !selectedFolderId)}
            >
              {isUploading ? (
                `Saving… ${uploadProgress}%`
              ) : targetDocumentId ? (
                <>
                  <Upload className="w-4 h-4" />
                  Append {pages.length} {pages.length === 1 ? "Page" : "Pages"}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload {pages.length > 1 ? "PDF" : "Document"} to Vault
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" type="button" onClick={handleClose}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
        )
      }
    >
      {/* Hidden native camera file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageFileSelect}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {error && (
        <Alert variant="danger" className="mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </Alert>
      )}

      {/* STEP 1: CAPTURE */}
      {step === "capture" && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-subtle text-brand shadow-sm mb-4">
            <Camera className="h-10 w-10" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            {targetDocumentId
              ? `Scan Additional Page`
              : pages.length > 0
                ? `Scan Page ${pages.length + 1}`
                : "Multi-Page Document Scanner"}
          </h3>
          <p className="text-sm text-text-muted max-w-sm mb-6">
            {targetDocumentId
              ? `Capture a new page to append to "${targetDocumentName || "this document"}". AI extraction will re-process with the new content.`
              : pages.length > 0
                ? `Position camera over page ${pages.length + 1}. You can capture multiple pages and stitch them into a single PDF.`
                : "Capture contracts, receipts, or medical records. We’ll auto-crop, compress, and stitch multiple pages into a PDF."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full justify-center"
            >
              <Camera className="w-4 h-4" />
              {pages.length > 0 ? `Capture Page ${pages.length + 1}` : "Open Camera"}
            </Button>
          </div>
          {pages.length > 0 && (
            <button
              type="button"
              onClick={() => setStep("review")}
              className="mt-4 text-xs font-medium text-brand hover:underline"
            >
              ← Back to review ({pages.length} {pages.length === 1 ? "page" : "pages"} ready)
            </button>
          )}
        </div>
      )}

      {/* STEP 2: CROP & PERSPECTIVE ADJUST */}
      {step === "crop" && rawImageSrc && (
        <div className="space-y-4">
          {/* Controls toolbar: multi-line with Filter and Crop on separate lines */}
          <div className="space-y-2.5 rounded-xl border border-border-subtle bg-surface-muted/50 p-3">
            {/* Line 1: Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle/60 pb-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-text-secondary mr-1">Filter:</span>
                <button
                  type="button"
                  onClick={() => setFilter("document")}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    filter === "document"
                      ? "bg-brand text-white shadow-xs font-semibold"
                      : "text-text-secondary hover:bg-surface"
                  }`}
                >
                  Document
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("color")}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    filter === "color"
                      ? "bg-brand text-white shadow-xs font-semibold"
                      : "text-text-secondary hover:bg-surface"
                  }`}
                >
                  Color
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("grayscale")}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    filter === "grayscale"
                      ? "bg-brand text-white shadow-xs font-semibold"
                      : "text-text-secondary hover:bg-surface"
                  }`}
                >
                  B&W
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRotate}
                  title="Rotate 90° clockwise"
                  aria-label="Rotate 90 degrees clockwise"
                  className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-muted active:scale-95 transition-all shadow-2xs"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Rotate 90°</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetCorners}
                  title="Reset corners"
                  aria-label="Reset corners to full page"
                  className="flex items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-muted active:scale-95 transition-all shadow-2xs"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Line 2: Crop & Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-text-secondary mr-1">Crop:</span>
                <button
                  type="button"
                  onClick={() => {
                    if (imageElementRef.current) {
                      autoDetectCornersForImage(imageElementRef.current);
                    }
                  }}
                  title="Auto-detect document boundaries"
                  aria-label="Auto-detect document corners"
                  className="flex items-center gap-1 rounded-lg border border-brand/40 bg-brand-subtle px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/20 active:scale-95 transition-all shadow-2xs"
                >
                  <Sparkles className="h-3.5 w-3.5 text-brand" />
                  <span>Auto Crop</span>
                </button>

                {ASPECT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyAspectPreset(preset.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      aspectPreset === preset.id
                        ? "bg-surface border border-border-subtle text-brand font-semibold shadow-2xs"
                        : "text-text-muted hover:text-text-primary hover:bg-surface/50"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive crop canvas container */}
          <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-black/90 p-4 flex items-center justify-center min-h-[360px] max-h-[64vh]">
            <div
              ref={cropContainerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative inline-block touch-none select-none max-h-[58vh]"
            >
              <img
                ref={imageElementRef}
                src={rawImageSrc}
                alt="Document scan candidate"
                className="max-h-[58vh] max-w-full w-auto object-contain pointer-events-none rounded shadow-md block"
                style={{
                  transform: `rotate(${rotationDegrees}deg)`,
                  filter: getLiveFilterStyle(filter),
                  transition: "transform 0.15s ease, filter 0.2s ease",
                }}
              />

              {/* SVG Overlay displaying quad polygon and connection lines */}
              <svg
                className="absolute inset-0 h-full w-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polygon
                  points={`
                    ${corners.topLeft.x * 100},${corners.topLeft.y * 100}
                    ${corners.topRight.x * 100},${corners.topRight.y * 100}
                    ${corners.bottomRight.x * 100},${corners.bottomRight.y * 100}
                    ${corners.bottomLeft.x * 100},${corners.bottomLeft.y * 100}
                  `}
                  fill="rgba(37, 99, 235, 0.22)"
                  stroke="rgb(37, 99, 235)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* 4 Interactive Corner Pins */}
              {(
                [
                  { key: "topLeft", pt: corners.topLeft, label: "Top-left corner" },
                  { key: "topRight", pt: corners.topRight, label: "Top-right corner" },
                  { key: "bottomRight", pt: corners.bottomRight, label: "Bottom-right corner" },
                  { key: "bottomLeft", pt: corners.bottomLeft, label: "Bottom-left corner" },
                ] as const
              ).map(({ key, pt, label }) => (
                <div
                  key={key}
                  role="slider"
                  tabIndex={0}
                  aria-label={label}
                  aria-valuenow={Math.round(pt.x * 100)}
                  onKeyDown={(e) => handleKeyDown(key, e)}
                  onPointerDown={(e) => handlePointerDown(key, e)}
                  style={{
                    left: `${pt.x * 100}%`,
                    top: `${pt.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  className={`absolute z-10 flex h-11 w-11 items-center justify-center cursor-grab active:cursor-grabbing touch-none ${
                    activeCorner === key ? "scale-125" : "hover:scale-110"
                  } transition-transform`}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-brand shadow-lg ring-2 ring-brand/40">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              {pages.length > 0 ? `Currently editing Page ${pages.length + 1}` : "Editing Page 1"}
            </span>
            <span>Drag corners to align edges</span>
          </div>
        </div>
      )}

      {/* STEP 3: REVIEW & UPLOAD */}
      {step === "review" && (
        <div className="space-y-4">
          {/* Multi-page banner */}
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>
                  {targetDocumentId
                    ? `Ready to append ${pages.length} ${pages.length === 1 ? "page" : "pages"}`
                    : pages.length > 1
                      ? `${pages.length} Pages · Multi-Page PDF Stitched`
                      : "Document Enhanced & Compressed"}
                </strong>
                {" · "}
                {(totalSize / 1024).toFixed(0)} KB total
                {savingsPct !== null && savingsPct > 0 && ` (${savingsPct}% smaller)`}
              </span>
            </div>
            {pages.length > 1 && (
              <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <Layers className="h-3.5 w-3.5" />
                PDF
              </span>
            )}
          </div>

          {/* Scanned Pages Strip / Carousel */}
          {pages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-secondary">
                  Pages ({pages.length})
                </span>
                <span className="text-[11px] text-text-muted">
                  Drag & drop cards to reorder pages
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                {pages.map((page, idx) => (
                  <div
                    key={page.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={() => setDraggedPageIndex(null)}
                    onClick={() => setActiveReviewPageIndex(idx)}
                    className={`relative group shrink-0 rounded-xl border p-1.5 cursor-grab active:cursor-grabbing transition-all ${
                      draggedPageIndex === idx
                        ? "opacity-40 border-dashed border-brand scale-95"
                        : activeReviewPageIndex === idx
                          ? "border-brand ring-2 ring-brand/20 bg-surface shadow-sm"
                          : "border-border-subtle bg-surface-muted/30 hover:border-border"
                    }`}
                  >
                    <div className="relative h-24 w-18 overflow-hidden rounded-lg bg-surface">
                      <img
                        src={page.previewUrl || page.thumbnail}
                        alt={`Page ${idx + 1}`}
                        className="h-full w-full object-cover pointer-events-none"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 py-0.5 text-[10px] font-bold text-white leading-none">
                        p.{idx + 1}
                      </span>
                    </div>

                    {/* Page action controls */}
                    <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMovePage(idx, "left");
                        }}
                        className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                        title="Move left"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePage(idx);
                        }}
                        className="p-0.5 text-text-muted hover:text-danger"
                        title="Delete page"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === pages.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMovePage(idx, "right");
                        }}
                        className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30"
                        title="Move right"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add Page Card */}
                <button
                  type="button"
                  onClick={() => {
                    setRawImageSrc(null);
                    setStep("capture");
                  }}
                  className="flex h-[126px] w-18 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-subtle bg-surface-muted/20 text-text-muted transition-colors hover:border-brand hover:text-brand"
                >
                  <Plus className="h-5 w-5 mb-1" />
                  <span className="text-[10px] font-medium">+ Page</span>
                </button>
              </div>
            </div>
          )}

          {/* Active page large preview */}
          {pages[activeReviewPageIndex] && (
            <div className="flex flex-col items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface-muted/30 p-3 sm:p-4">
              <div className="text-[11px] font-medium text-text-muted mb-2">
                Page {activeReviewPageIndex + 1} Preview (
                {(pages[activeReviewPageIndex].size / 1024).toFixed(0)} KB)
              </div>
              <img
                src={
                  pages[activeReviewPageIndex].previewUrl || pages[activeReviewPageIndex].thumbnail
                }
                alt={`Preview of page ${activeReviewPageIndex + 1}`}
                className="max-h-72 sm:max-h-80 w-auto max-w-full object-contain rounded-lg shadow-sm border border-border-subtle bg-white"
              />
            </div>
          )}

          {/* Metadata Form (only when creating a new document, hidden in append mode) */}
          {!targetDocumentId && (
            <div className="space-y-3">
              <div>
                <Label>Document Title</Label>
                <Input
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="e.g. Contract or Receipt 2026"
                  className="w-full"
                />
              </div>

              <div>
                <Label>Target Vault Folder</Label>
                <Select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="w-full"
                >
                  {folders.length === 0 ? (
                    <option value="">No folders found</option>
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
                <Label>Tags</Label>
                <MultiSelectPills
                  options={DOCUMENT_TAG_SUGGESTIONS}
                  value={tags}
                  onChange={(values) => setTags(values.map(String))}
                  allowCustom
                  placeholder="Add tags..."
                />
              </div>

              <div>
                <Label>Expiry or Due Date (Optional)</Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="camera-scan-generate-ai"
                  checked={generateAi}
                  onChange={(e) => setGenerateAi(e.target.checked)}
                />
                <label
                  htmlFor="camera-scan-generate-ai"
                  className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Extract text, dates, and multi-page summary with Gemini AI</span>
                </label>
              </div>
            </div>
          )}

          {targetDocumentId && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-800 dark:text-sky-300">
              <p className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>
                  After appending, Vaulty will automatically re-run Gemini AI processing across all
                  pages to update the extracted text, summary, and dates.
                </span>
              </p>
            </div>
          )}

          {isUploading && (
            <div className="space-y-1.5 pt-2" role="status" aria-live="polite">
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-text-muted text-right">Saving… {uploadProgress}%</p>
            </div>
          )}
        </div>
      )}
    </Blade>
  );
}

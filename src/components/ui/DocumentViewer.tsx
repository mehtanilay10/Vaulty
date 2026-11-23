/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Expand,
  FileText,
  CloudOff,
  RefreshCw,
} from "lucide-react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  fileUrl: string;
  mimeType: string;
  fileName: string;
  thumbnailUrl?: string | null;
  onEdit?: () => void;
}

export function DocumentViewer({
  fileUrl,
  mimeType,
  fileName,
  thumbnailUrl,
  onEdit,
}: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const isImage = mimeType.startsWith("image/");
  const [activeImageSrc, setActiveImageSrc] = useState<string>(fileUrl);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setActiveImageSrc(fileUrl);
    setImageLoading(true);
    setImageError(false);
    setError(null);
  }, [fileUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Measure container and auto-fit to width on document load
  const fitToWidth = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    // Standard PDF page width is ~595px (A4 points at 72dpi)
    const targetWidth = Math.max(containerWidth - 48, 300);
    const calculatedScale = Math.min(Math.max(targetWidth / 595, 0.5), 2.5);
    setScale(Number(calculatedScale.toFixed(2)));
  }, []);

  const fitToPage = useCallback(() => {
    setScale(1.0);
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
    setCurrentPage(1);
    setPageInput("1");
    // Auto-fit to container width on initial load
    setTimeout(fitToWidth, 50);
  };

  const onDocumentLoadError = (err: unknown) => {
    console.error("PDF load error:", err);
    const msg = (err as Error)?.message || "";
    if (
      msg.includes("404") ||
      msg.includes("500") ||
      msg.includes("retrieving PDF") ||
      msg.includes("Missing PDF")
    ) {
      setError("File not found on Google Drive. It may have been moved or deleted in Drive.");
    } else {
      setError("Failed to load PDF preview.");
    }
  };

  const changePage = (delta: number) => {
    setCurrentPage((prev) => {
      const next = Math.max(1, Math.min(prev + delta, numPages));
      setPageInput(String(next));
      return next;
    });
  };

  const handlePageJump = (pageStr: string) => {
    const p = parseInt(pageStr, 10);
    if (!isNaN(p) && p >= 1 && p <= numPages) {
      setCurrentPage(p);
      setPageInput(String(p));
    } else {
      setPageInput(String(currentPage));
    }
  };

  const zoomIn = () => setScale((prev) => Math.min(Number((prev + 0.2).toFixed(2)), 3.0));
  const zoomOut = () => setScale((prev) => Math.max(Number((prev - 0.2).toFixed(2)), 0.4));
  const resetZoom = () => setScale(1.0);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Image viewer
  if (isImage) {
    return (
      <div
        className={`w-full h-full flex flex-col ${
          isFullscreen ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-md p-4" : "relative"
        }`}
      >
        <div className="flex items-center justify-between p-2.5 border-b border-border-subtle bg-surface/90 rounded-t-xl">
          <span className="text-xs font-medium text-text-primary truncate max-w-[200px] sm:max-w-md">
            {fileName}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={zoomOut}
              className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs text-text-secondary w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={resetZoom}
              className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary"
              title="Reset Zoom"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary ml-1"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="relative flex-1 w-full overflow-auto flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-950">
          {imageLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
                <span className="text-xs text-text-muted">Loading image…</span>
              </div>
            </div>
          )}

          {imageError ? (
            <div className="flex flex-col items-center justify-center text-center p-8 space-y-3">
              <FileText className="h-10 w-10 text-text-muted" />
              <p className="text-sm font-semibold text-danger">Failed to load image preview.</p>
              <div className="flex items-center gap-3 mt-2">
                <a href={fileUrl} download={fileName} className="btn btn-secondary text-xs">
                  Download file
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setImageError(false);
                    setImageLoading(true);
                    setActiveImageSrc(`${fileUrl}?t=${Date.now()}`);
                  }}
                  className="btn btn-primary text-xs"
                >
                  Retry preview
                </button>
              </div>
            </div>
          ) : (
            <img
              src={activeImageSrc}
              alt={fileName}
              onLoad={() => {
                setImageLoading(false);
                setImageError(false);
              }}
              onError={() => {
                setImageLoading(false);
                if (thumbnailUrl && activeImageSrc !== thumbnailUrl) {
                  // Fallback to thumbnail URL if file stream had an issue
                  setActiveImageSrc(thumbnailUrl);
                } else {
                  setImageError(true);
                }
              }}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "center center",
                display: imageLoading ? "none" : "block",
              }}
              className="max-w-full max-h-full object-contain rounded-lg shadow-fluent-8 transition-transform duration-150"
            />
          )}
        </div>
      </div>
    );
  }

  // Non-PDF and non-image
  if (!mimeType.includes("pdf")) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-12 space-y-3">
        <FileText className="h-10 w-10 text-text-muted" />
        <p className="text-sm font-semibold text-text-secondary">
          Preview not available for this file type
        </p>
        <p className="text-xs text-text-muted">{mimeType}</p>
        <a href={fileUrl} download={fileName} className="btn btn-secondary text-xs mt-2">
          Download file
        </a>
      </div>
    );
  }

  const renderErrorContent = (customMsg?: string) => (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 min-h-[360px]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger shadow-2xs">
        <CloudOff className="h-8 w-8" />
      </div>
      <div>
        <h4 className="text-base font-semibold text-text-primary">
          File not found on Google Drive
        </h4>
        <p className="text-xs text-text-muted max-w-md mt-1">
          {customMsg ||
            error ||
            "The file could not be retrieved from your Google Drive storage. It may have been moved, renamed, or deleted in Drive."}
        </p>
      </div>

      {thumbnailUrl && (
        <div className="mt-3 p-2.5 border border-border-subtle rounded-xl bg-surface max-w-xs shadow-2xs">
          <p className="text-[11px] text-text-muted mb-1.5 font-medium">Cached Thumbnail Preview</p>
          <img
            src={thumbnailUrl}
            alt={fileName}
            className="max-h-52 w-auto mx-auto object-contain rounded-lg border border-border-subtle"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-3">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setRetryKey((k) => k + 1);
          }}
          className="btn btn-secondary text-xs gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry Preview</span>
        </button>
        {onEdit && (
          <button type="button" onClick={onEdit} className="btn btn-primary text-xs">
            Edit / Properties
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex flex-col ${
        isFullscreen ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-md p-4" : "relative"
      }`}
    >
      {error && renderErrorContent()}

      {!error && (
        <>
          {/* Top Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 border-b border-border-subtle bg-surface/90 rounded-t-xl z-10">
            {/* Page Navigation */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => changePage(-1)}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary disabled:opacity-40"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1 text-xs text-text-secondary">
                <span>Page</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                      handlePageJump(pageInput);
                    }
                  }}
                  onBlur={() => handlePageJump(pageInput)}
                  className="w-10 h-7 text-center rounded-md border border-border-subtle bg-surface px-1 text-xs font-medium"
                />
                <span>of {numPages || 1}</span>
              </div>

              <button
                type="button"
                onClick={() => changePage(1)}
                disabled={currentPage >= numPages}
                className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary disabled:opacity-40"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Scaling and Fullscreen controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={zoomOut}
                className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>

              <span className="text-xs text-text-secondary w-12 text-center font-mono">
                {Math.round(scale * 100)}%
              </span>

              <button
                type="button"
                onClick={zoomIn}
                className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={fitToWidth}
                className="px-2 py-1 rounded-md hover:bg-surface-muted text-[11px] font-medium text-text-secondary border border-border-subtle hidden sm:inline-flex items-center gap-1"
                title="Fit to Width"
              >
                <Expand className="h-3 w-3" />
                Fit Width
              </button>

              <button
                type="button"
                onClick={fitToPage}
                className="px-2 py-1 rounded-md hover:bg-surface-muted text-[11px] font-medium text-text-secondary border border-border-subtle hidden sm:inline-flex"
                title="Fit to Page (100%)"
              >
                100%
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary ml-1"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Document Content View */}
          <div className="flex-1 overflow-auto flex justify-center bg-gray-100 dark:bg-gray-950 p-2 md:p-6 min-h-[420px]">
            <ErrorBoundary fallback={renderErrorContent()}>
              <Document
                key={retryKey}
                file={`${fileUrl}${retryKey ? `?retry=${retryKey}` : ""}`}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                error={renderErrorContent()}
                loading={
                  <div className="flex items-center justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
                  </div>
                }
                className="flex flex-col items-center"
              >
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-fluent-8 rounded-sm bg-white"
                />
              </Document>
            </ErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}

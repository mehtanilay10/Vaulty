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
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  fileUrl: string;
  mimeType: string;
  fileName: string;
}

export function DocumentViewer({ fileUrl, mimeType, fileName }: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImage = mimeType.startsWith("image/");
  const imageUrl = isImage ? fileUrl : null;

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
    setError("Failed to load PDF preview.");
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
  if (isImage && imageUrl) {
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

        <div className="flex-1 w-full overflow-auto flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-950">
          <img
            src={imageUrl}
            alt={fileName}
            style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
            className="max-w-full max-h-full object-contain rounded-lg shadow-fluent-8 transition-transform duration-150"
          />
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

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex flex-col ${
        isFullscreen ? "fixed inset-0 z-50 bg-background/95 backdrop-blur-md p-4" : "relative"
      }`}
    >
      {error && (
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <p className="text-sm font-semibold text-danger mb-2">{error}</p>
            <a href={fileUrl} download={fileName} className="text-xs text-brand hover:underline">
              Download to view
            </a>
          </div>
        </div>
      )}

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
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
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
          </div>
        </>
      )}
    </div>
  );
}

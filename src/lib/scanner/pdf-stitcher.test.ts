import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  createPdfFromImages,
  appendPagesToPdf,
  convertImageToPdf,
  stitchBlobsToPdf,
} from "./pdf-stitcher";

// Minimal valid 1x1 black JPEG
const sampleJpgBytes = new Uint8Array([
  0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07,
  0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f,
  0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c,
  0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d,
  0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01,
  0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01,
  0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf,
  0x80, 0xff, 0xd9,
]);

describe("pdf-stitcher", () => {
  it("creates a single-page PDF from an image", async () => {
    const pdfBytes = await convertImageToPdf(sampleJpgBytes, "image/jpeg");
    expect(pdfBytes.length).toBeGreaterThan(0);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("creates a multi-page PDF from multiple images", async () => {
    const pdfBytes = await createPdfFromImages([
      { data: sampleJpgBytes, mimeType: "image/jpeg" },
      { data: sampleJpgBytes, mimeType: "image/jpeg" },
      { data: sampleJpgBytes, mimeType: "image/jpeg" },
    ]);

    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it("appends new pages to an existing PDF", async () => {
    // Initial 1-page PDF
    const initialPdf = await convertImageToPdf(sampleJpgBytes, "image/jpeg");
    const initialDoc = await PDFDocument.load(initialPdf);
    expect(initialDoc.getPageCount()).toBe(1);

    // Append 2 more image pages
    const updatedPdf = await appendPagesToPdf(initialPdf, [
      { data: sampleJpgBytes, mimeType: "image/jpeg" },
      { data: sampleJpgBytes, mimeType: "image/jpeg" },
    ]);

    const updatedDoc = await PDFDocument.load(updatedPdf);
    expect(updatedDoc.getPageCount()).toBe(3);
  });

  it("stitches image Blobs directly into a PDF Blob", async () => {
    const blob1 = new Blob([sampleJpgBytes.buffer as ArrayBuffer], { type: "image/jpeg" });
    const blob2 = new Blob([sampleJpgBytes.buffer as ArrayBuffer], { type: "image/jpeg" });

    const pdfBlob = await stitchBlobsToPdf([blob1, blob2]);
    expect(pdfBlob.type).toBe("application/pdf");
    expect(pdfBlob.size).toBeGreaterThan(0);

    const doc = await PDFDocument.load(new Uint8Array(await pdfBlob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(2);
  });

  it("throws when trying to create a PDF with 0 pages", async () => {
    await expect(createPdfFromImages([])).rejects.toThrow("Cannot create a PDF with 0 pages");
  });
});

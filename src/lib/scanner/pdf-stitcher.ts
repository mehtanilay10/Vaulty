import { PDFDocument } from "pdf-lib";

export interface ImagePageInput {
  data: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
}

/**
 * Normalizes a Buffer or Uint8Array so that its byteOffset matches its ArrayBuffer.
 * This prevents pdf-lib from reading outside the view slice when Node Buffers share a pool.
 */
function toExactUint8Array(data: Uint8Array): Uint8Array {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data;
  }
  return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

/**
 * Creates a clean, compressed multi-page PDF from an array of image pages.
 */
export async function createPdfFromImages(pages: ImagePageInput[]): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("Cannot create a PDF with 0 pages");
  }

  const pdfDoc = await PDFDocument.create();

  for (const pageInput of pages) {
    const exactBytes = toExactUint8Array(pageInput.data);
    const image =
      pageInput.mimeType === "image/png"
        ? await pdfDoc.embedPng(exactBytes)
        : await pdfDoc.embedJpg(exactBytes);

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  return await pdfDoc.save();
}

/**
 * Appends new image or PDF pages to an existing PDF document.
 */
export async function appendPagesToPdf(
  existingPdfBytes: Uint8Array,
  newPages: Array<ImagePageInput | Uint8Array>,
): Promise<Uint8Array> {
  const exactPdfBytes = toExactUint8Array(existingPdfBytes);
  const pdfDoc = await PDFDocument.load(exactPdfBytes);

  for (const item of newPages) {
    if (item instanceof Uint8Array) {
      // Append pages from another PDF
      const srcDoc = await PDFDocument.load(toExactUint8Array(item));
      const copiedPages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      copiedPages.forEach((p) => pdfDoc.addPage(p));
    } else {
      // Append an image page
      const exactBytes = toExactUint8Array(item.data);
      const image =
        item.mimeType === "image/png"
          ? await pdfDoc.embedPng(exactBytes)
          : await pdfDoc.embedJpg(exactBytes);

      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }
  }

  return await pdfDoc.save();
}

/**
 * Converts a single image into a 1-page PDF.
 */
export async function convertImageToPdf(
  imageBytes: Uint8Array,
  mimeType: "image/jpeg" | "image/png",
): Promise<Uint8Array> {
  return createPdfFromImages([{ data: imageBytes, mimeType }]);
}

/**
 * High-level helper: stitches multiple image Blobs into a single compressed PDF Blob.
 */
export async function stitchBlobsToPdf(blobs: Blob[]): Promise<Blob> {
  const pages: ImagePageInput[] = [];
  for (const blob of blobs) {
    const buf = await blob.arrayBuffer();
    pages.push({
      data: new Uint8Array(buf),
      mimeType: blob.type.includes("png") ? "image/png" : "image/jpeg",
    });
  }
  const pdfBytes = await createPdfFromImages(pages);
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

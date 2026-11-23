/**
 * Perspective warping, corner detection, and document image enhancement
 * for mobile camera document scanning.
 */

export interface Point {
  x: number;
  y: number;
}

export interface QuadPoints {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export type ScanFilter = "color" | "document" | "grayscale";

export interface PerspectiveTransformOptions {
  aspectRatio?: number | null; // e.g. 1.414 for A4, null for free/auto
  maxDimension?: number; // max width or height in px (default 2048)
  filter?: ScanFilter;
  rotation?: 0 | 90 | 180 | 270;
}

export interface ProjectiveMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/**
 * Calculates Heckbert 3x3 projective transformation matrix mapping
 * normalized destination space [0, 1]^2 to quadrilateral source points.
 */
export function computeProjectiveMatrix(quad: QuadPoints): ProjectiveMatrix | null {
  const p0 = quad.topLeft;
  const p1 = quad.topRight;
  const p2 = quad.bottomRight;
  const p3 = quad.bottomLeft;

  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sy = p0.y - p1.y + p2.y - p3.y;

  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-10) {
    // Affine fallback when quadrilateral is a parallelogram
    return {
      a: p1.x - p0.x,
      b: p3.x - p0.x,
      c: p0.x,
      d: p1.y - p0.y,
      e: p3.y - p0.y,
      f: p0.y,
      g: 0,
      h: 0,
    };
  }

  const g = (sx * dy2 - dx2 * sy) / det;
  const h = (dx1 * sy - sx * dy1) / det;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;

  return { a, b, c, d, e, f, g, h };
}

/**
 * Maps destination pixel (u, v) in a dstW x dstH canvas to source coordinate (x, y).
 */
export function mapDestinationToSource(
  m: ProjectiveMatrix,
  u: number,
  v: number,
  dstW: number,
  dstH: number,
): Point {
  const un = dstW > 0 ? u / dstW : 0;
  const vn = dstH > 0 ? v / dstH : 0;
  const denom = m.g * un + m.h * vn + 1;
  const safeDenom = Math.abs(denom) < 1e-10 ? 1e-10 : denom;
  return {
    x: (m.a * un + m.b * vn + m.c) / safeDenom,
    y: (m.d * un + m.e * vn + m.f) / safeDenom,
  };
}

/**
 * Computes destination width and height based on the average edge lengths
 * of the quad, optionally locked to an aspect ratio and clamped to maxDimension.
 */
export function calculateOutputDimensions(
  quad: QuadPoints,
  aspectRatio?: number | null,
  maxDimension = 2048,
): { width: number; height: number } {
  const dist = (p1: Point, p2: Point) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

  const top = dist(quad.topLeft, quad.topRight);
  const bottom = dist(quad.bottomLeft, quad.bottomRight);
  const left = dist(quad.topLeft, quad.bottomLeft);
  const right = dist(quad.topRight, quad.bottomRight);

  let rawWidth = Math.max(1, Math.round(Math.max(top, bottom)));
  let rawHeight = Math.max(1, Math.round(Math.max(left, right)));

  if (aspectRatio && aspectRatio > 0) {
    // If aspect ratio is height / width
    rawHeight = Math.max(1, Math.round(rawWidth * aspectRatio));
  }

  // Scale down to fit within maxDimension if needed
  const maxSide = Math.max(rawWidth, rawHeight);
  if (maxSide > maxDimension) {
    const scale = maxDimension / maxSide;
    rawWidth = Math.max(1, Math.round(rawWidth * scale));
    rawHeight = Math.max(1, Math.round(rawHeight * scale));
  }

  return { width: rawWidth, height: rawHeight };
}

/**
 * Returns default corner quad inset by a percentage from the full image boundary.
 */
export function detectDefaultQuad(imgWidth: number, imgHeight: number, inset = 0.05): QuadPoints {
  const ix = Math.round(imgWidth * inset);
  const iy = Math.round(imgHeight * inset);
  return {
    topLeft: { x: ix, y: iy },
    topRight: { x: Math.max(ix + 1, imgWidth - ix), y: iy },
    bottomRight: { x: Math.max(ix + 1, imgWidth - ix), y: Math.max(iy + 1, imgHeight - iy) },
    bottomLeft: { x: ix, y: Math.max(iy + 1, imgHeight - iy) },
  };
}

/**
 * Automatically detects the quadrilateral bounding corners of document-type contents
 * (like Microsoft Lens, Google Scan, CamScanner) against their background.
 * Falls back to detectDefaultQuad if no distinct rectangular document boundary is detected.
 */
export function detectDocumentQuad(
  imageSource: { data: Uint8ClampedArray | number[]; width: number; height: number },
  fullWidth?: number,
  fullHeight?: number,
): QuadPoints {
  const w = imageSource.width;
  const h = imageSource.height;
  const targetW = fullWidth ?? w;
  const targetH = fullHeight ?? h;

  if (w < 4 || h < 4) {
    return detectDefaultQuad(targetW, targetH, 0.05);
  }

  const scaleX = targetW / w;
  const scaleY = targetH / h;
  const pixels = imageSource.data;
  const numPixels = w * h;

  // 1. Convert to luminance array and compute basic stats
  const lum = new Float32Array(numPixels);
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const l = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    lum[i] = l;
    if (l < minLum) minLum = l;
    if (l > maxLum) maxLum = l;
  }

  const contrast = maxLum - minLum;
  if (contrast < 25) {
    return detectDefaultQuad(targetW, targetH, 0.05);
  }

  // 2. Otsu thresholding to separate document from background
  const bins = new Uint32Array(32);
  for (let i = 0; i < numPixels; i++) {
    const bin = Math.min(31, Math.floor((lum[i] / 256) * 32));
    bins[bin]++;
  }

  const total = numPixels;
  let sumB = 0;
  let wB = 0;
  let maximum = 0;
  let thresholdBin = 16;
  let sum1 = 0;
  for (let i = 0; i < 32; i++) {
    sum1 += i * bins[i];
  }

  for (let i = 0; i < 32; i++) {
    wB += bins[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * bins[i];
    const mB = sumB / wB;
    const mF = (sum1 - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maximum) {
      maximum = between;
      thresholdBin = i;
    }
  }

  const threshold = ((thresholdBin + 1) / 32) * 256;

  // Determine if document is lighter than background by sampling outer edge pixels
  const marginX = Math.max(1, Math.floor(w * 0.02));
  const marginY = Math.max(1, Math.floor(h * 0.02));

  let edgeSum = 0;
  let edgeCount = 0;
  for (let x = 0; x < w; x += 2) {
    edgeSum += lum[x] + lum[(h - 1) * w + x];
    edgeCount += 2;
  }
  for (let y = 1; y < h - 1; y += 2) {
    edgeSum += lum[y * w] + lum[y * w + (w - 1)];
    edgeCount += 2;
  }
  const avgEdgeLum = edgeCount > 0 ? edgeSum / edgeCount : 128;
  const isDocLighter = avgEdgeLum < threshold;

  // 3. Find document boundary points

  let minTL = Infinity;
  let maxTR = -Infinity;
  let maxBR = -Infinity;
  let minBL = Infinity;

  let bestTL = { x: marginX, y: marginY };
  let bestTR = { x: w - marginX, y: marginY };
  let bestBR = { x: w - marginX, y: h - marginY };
  let bestBL = { x: marginX, y: h - marginY };

  let docPixelCount = 0;

  for (let y = marginY; y < h - marginY; y++) {
    const rowOffset = y * w;
    for (let x = marginX; x < w - marginX; x++) {
      const val = lum[rowOffset + x];
      const isDoc = isDocLighter ? val >= threshold : val < threshold;
      if (isDoc) {
        docPixelCount++;
        const sumXY = x + y;
        const diffXY = x - y;

        if (sumXY < minTL) {
          minTL = sumXY;
          bestTL = { x, y };
        }
        if (diffXY > maxTR) {
          maxTR = diffXY;
          bestTR = { x, y };
        }
        if (sumXY > maxBR) {
          maxBR = sumXY;
          bestBR = { x, y };
        }
        if (diffXY < minBL) {
          minBL = diffXY;
          bestBL = { x, y };
        }
      }
    }
  }

  const docRatio = docPixelCount / ((w - 2 * marginX) * (h - 2 * marginY));

  if (docRatio < 0.1 || docRatio > 0.96) {
    return detectDefaultQuad(targetW, targetH, 0.05);
  }

  const quadW = Math.max(bestTR.x - bestTL.x, bestBR.x - bestBL.x);
  const quadH = Math.max(bestBL.y - bestTL.y, bestBR.y - bestTR.y);

  if (quadW < w * 0.25 || quadH < h * 0.25) {
    return detectDefaultQuad(targetW, targetH, 0.05);
  }

  return {
    topLeft: {
      x: Math.round(Math.max(0, Math.min(targetW, bestTL.x * scaleX))),
      y: Math.round(Math.max(0, Math.min(targetH, bestTL.y * scaleY))),
    },
    topRight: {
      x: Math.round(Math.max(0, Math.min(targetW, bestTR.x * scaleX))),
      y: Math.round(Math.max(0, Math.min(targetH, bestTR.y * scaleY))),
    },
    bottomRight: {
      x: Math.round(Math.max(0, Math.min(targetW, bestBR.x * scaleX))),
      y: Math.round(Math.max(0, Math.min(targetH, bestBR.y * scaleY))),
    },
    bottomLeft: {
      x: Math.round(Math.max(0, Math.min(targetW, bestBL.x * scaleX))),
      y: Math.round(Math.max(0, Math.min(targetH, bestBL.y * scaleY))),
    },
  };
}

/**
 * Bilinear sampling of ImageData at subpixel location (x, y).
 */
export function sampleBilinear(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  out: [number, number, number, number],
): void {
  const clampX = Math.max(0, Math.min(width - 1, x));
  const clampY = Math.max(0, Math.min(height - 1, y));

  const x0 = Math.floor(clampX);
  const y0 = Math.floor(clampY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);

  const dx = clampX - x0;
  const dy = clampY - y0;

  const w00 = (1 - dx) * (1 - dy);
  const w10 = dx * (1 - dy);
  const w01 = (1 - dx) * dy;
  const w11 = dx * dy;

  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x1) * 4;
  const idx01 = (y1 * width + x0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  out[0] = Math.round(
    w00 * srcData[idx00] + w10 * srcData[idx10] + w01 * srcData[idx01] + w11 * srcData[idx11],
  );
  out[1] = Math.round(
    w00 * srcData[idx00 + 1] +
      w10 * srcData[idx10 + 1] +
      w01 * srcData[idx01 + 1] +
      w11 * srcData[idx11 + 1],
  );
  out[2] = Math.round(
    w00 * srcData[idx00 + 2] +
      w10 * srcData[idx10 + 2] +
      w01 * srcData[idx01 + 2] +
      w11 * srcData[idx11 + 2],
  );
  out[3] = Math.round(
    w00 * srcData[idx00 + 3] +
      w10 * srcData[idx10 + 3] +
      w01 * srcData[idx01 + 3] +
      w11 * srcData[idx11 + 3],
  );
}

/**
 * Performs pure pixel perspective warp with bilinear antialiasing and color filtering.
 */
export function warpImageData(
  srcData: ImageData,
  quad: QuadPoints,
  dstWidth: number,
  dstHeight: number,
  filter: ScanFilter = "color",
): ImageData {
  const matrix = computeProjectiveMatrix(quad);
  if (!matrix) throw new Error("Invalid quadrilateral geometry");

  const dstData = new ImageData(dstWidth, dstHeight);
  const srcPixels = srcData.data;
  const dstPixels = dstData.data;
  const srcW = srcData.width;
  const srcH = srcData.height;

  const pixel: [number, number, number, number] = [0, 0, 0, 255];

  for (let v = 0; v < dstHeight; v++) {
    const rowOffset = v * dstWidth * 4;
    for (let u = 0; u < dstWidth; u++) {
      const srcPt = mapDestinationToSource(matrix, u, v, dstWidth, dstHeight);
      sampleBilinear(srcPixels, srcW, srcH, srcPt.x, srcPt.y, pixel);

      const dstIdx = rowOffset + u * 4;

      if (filter === "color") {
        dstPixels[dstIdx] = pixel[0];
        dstPixels[dstIdx + 1] = pixel[1];
        dstPixels[dstIdx + 2] = pixel[2];
        dstPixels[dstIdx + 3] = pixel[3];
      } else if (filter === "grayscale") {
        const yVal = Math.round(0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]);
        dstPixels[dstIdx] = yVal;
        dstPixels[dstIdx + 1] = yVal;
        dstPixels[dstIdx + 2] = yVal;
        dstPixels[dstIdx + 3] = pixel[3];
      } else if (filter === "document") {
        // High contrast document filter: whiten paper background, darken ink/text, preserve colored ink
        const r = pixel[0];
        const g = pixel[1];
        const b = pixel[2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;

        if (saturation > 0.2 && lum < 220) {
          // Colored ink (signature, stamp, logo): boost contrast while preserving hue
          const contrast = 1.35;
          dstPixels[dstIdx] = Math.min(255, Math.max(0, Math.round((r - 128) * contrast + 128)));
          dstPixels[dstIdx + 1] = Math.min(
            255,
            Math.max(0, Math.round((g - 128) * contrast + 128)),
          );
          dstPixels[dstIdx + 2] = Math.min(
            255,
            Math.max(0, Math.round((b - 128) * contrast + 128)),
          );
          dstPixels[dstIdx + 3] = pixel[3];
        } else {
          // Monochromatic document text & background whitening
          const low = 70;
          const high = 205;
          const enhanced = Math.min(255, Math.max(0, ((lum - low) / (high - low)) * 255));
          const val = Math.round(enhanced);
          dstPixels[dstIdx] = val;
          dstPixels[dstIdx + 1] = val;
          dstPixels[dstIdx + 2] = val;
          dstPixels[dstIdx + 3] = pixel[3];
        }
      }
    }
  }

  return dstData;
}

/**
 * Rotates an HTMLCanvasElement by 0, 90, 180, or 270 degrees clockwise.
 */
export function rotateCanvas(
  sourceCanvas: HTMLCanvasElement,
  degrees: 0 | 90 | 180 | 270,
): HTMLCanvasElement {
  if (degrees === 0) return sourceCanvas;

  const target = document.createElement("canvas");
  const ctx = target.getContext("2d");
  if (!ctx) return sourceCanvas;

  const swapDims = degrees === 90 || degrees === 270;
  target.width = swapDims ? sourceCanvas.height : sourceCanvas.width;
  target.height = swapDims ? sourceCanvas.width : sourceCanvas.height;

  ctx.translate(target.width / 2, target.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

  return target;
}

/**
 * Compresses canvas output to a high-quality JPEG or WebP Blob.
 */
export function compressCanvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/jpeg" | "image/webp" = "image/jpeg",
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to compress canvas to blob"));
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Creates a clean 200x200 thumbnail Data URL (≤ 64 KB) for document grid previews.
 */
export function generateThumbnailDataUrl(canvas: HTMLCanvasElement, targetSize = 200): string {
  const thumb = document.createElement("canvas");
  thumb.width = targetSize;
  thumb.height = targetSize;
  const ctx = thumb.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetSize, targetSize);

  const scale = Math.min(targetSize / canvas.width, targetSize / canvas.height);
  const x = (targetSize - canvas.width * scale) / 2;
  const y = (targetSize - canvas.height * scale) / 2;

  ctx.drawImage(canvas, x, y, canvas.width * scale, canvas.height * scale);
  return thumb.toDataURL("image/jpeg", 0.75);
}

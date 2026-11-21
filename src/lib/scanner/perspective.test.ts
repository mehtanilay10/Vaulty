import { describe, it, expect } from "vitest";
import {
  computeProjectiveMatrix,
  mapDestinationToSource,
  calculateOutputDimensions,
  detectDefaultQuad,
  sampleBilinear,
  type QuadPoints,
} from "./perspective";

describe("perspective scanner math", () => {
  it("computes exact projective matrix for orthogonal rectangle", () => {
    const quad: QuadPoints = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 200 },
      bottomLeft: { x: 0, y: 200 },
    };

    const matrix = computeProjectiveMatrix(quad);
    expect(matrix).not.toBeNull();
    if (!matrix) return;

    // Test the 4 corners
    const tl = mapDestinationToSource(matrix, 0, 0, 100, 200);
    expect(tl.x).toBeCloseTo(0, 1);
    expect(tl.y).toBeCloseTo(0, 1);

    const tr = mapDestinationToSource(matrix, 100, 0, 100, 200);
    expect(tr.x).toBeCloseTo(100, 1);
    expect(tr.y).toBeCloseTo(0, 1);

    const br = mapDestinationToSource(matrix, 100, 200, 100, 200);
    expect(br.x).toBeCloseTo(100, 1);
    expect(br.y).toBeCloseTo(200, 1);

    const bl = mapDestinationToSource(matrix, 0, 200, 100, 200);
    expect(bl.x).toBeCloseTo(0, 1);
    expect(bl.y).toBeCloseTo(200, 1);
  });

  it("accurately projects a skewed perspective trapezoid", () => {
    // Simulating camera angled from bottom-up
    const quad: QuadPoints = {
      topLeft: { x: 40, y: 30 },
      topRight: { x: 160, y: 30 },
      bottomRight: { x: 190, y: 270 },
      bottomLeft: { x: 10, y: 270 },
    };

    const matrix = computeProjectiveMatrix(quad);
    expect(matrix).not.toBeNull();
    if (!matrix) return;

    const dstW = 150;
    const dstH = 240;

    const tl = mapDestinationToSource(matrix, 0, 0, dstW, dstH);
    expect(tl.x).toBeCloseTo(40, 1);
    expect(tl.y).toBeCloseTo(30, 1);

    const tr = mapDestinationToSource(matrix, dstW, 0, dstW, dstH);
    expect(tr.x).toBeCloseTo(160, 1);
    expect(tr.y).toBeCloseTo(30, 1);

    const br = mapDestinationToSource(matrix, dstW, dstH, dstW, dstH);
    expect(br.x).toBeCloseTo(190, 1);
    expect(br.y).toBeCloseTo(270, 1);

    const bl = mapDestinationToSource(matrix, 0, dstH, dstW, dstH);
    expect(bl.x).toBeCloseTo(10, 1);
    expect(bl.y).toBeCloseTo(270, 1);
  });

  it("calculates output dimensions and preserves aspect ratio", () => {
    const quad: QuadPoints = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1000, y: 0 },
      bottomRight: { x: 1000, y: 1400 },
      bottomLeft: { x: 0, y: 1400 },
    };

    // Free aspect ratio
    const freeDim = calculateOutputDimensions(quad);
    expect(freeDim.width).toBe(1000);
    expect(freeDim.height).toBe(1400);

    // Locked aspect ratio (A4 = 1.4142)
    const a4Dim = calculateOutputDimensions(quad, 1.4142);
    expect(a4Dim.width).toBe(1000);
    expect(a4Dim.height).toBe(1414);

    // Max dimension clamping (e.g. max 500)
    const clampedDim = calculateOutputDimensions(quad, null, 500);
    expect(clampedDim.width).toBe(357);
    expect(clampedDim.height).toBe(500);
  });

  it("detects default inset corners correctly", () => {
    const quad = detectDefaultQuad(1000, 2000, 0.05);
    expect(quad.topLeft).toEqual({ x: 50, y: 100 });
    expect(quad.topRight).toEqual({ x: 950, y: 100 });
    expect(quad.bottomRight).toEqual({ x: 950, y: 1900 });
    expect(quad.bottomLeft).toEqual({ x: 50, y: 1900 });
  });

  it("interpolates subpixel values bilinearly", () => {
    // 2x2 test image:
    // [ (100,0,0,255), (200,0,0,255) ]
    // [ (0,0,0,255),   (100,0,0,255) ]
    const data = new Uint8ClampedArray([
      100, 0, 0, 255, 200, 0, 0, 255, 0, 0, 0, 255, 100, 0, 0, 255,
    ]);

    const out: [number, number, number, number] = [0, 0, 0, 0];
    sampleBilinear(data, 2, 2, 0.5, 0.5, out);

    // Expected R: (100 + 200 + 0 + 100) / 4 = 100
    expect(out[0]).toBe(100);
    expect(out[3]).toBe(255);
  });
});

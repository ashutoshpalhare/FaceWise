"use client";

/**
 * Canvas/vision glue between the DOM (video, images) and the pure recognition
 * math in src/lib/recognition (which stays framework-free and unit-tested).
 */

import { toGray } from "@/lib/recognition/lbph";

export interface NormBox {
  /** all coords normalized 0..1 relative to the video frame */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceCrop {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

let sharedCanvas: HTMLCanvasElement | null = null;
function canvas2d(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
  sharedCanvas.width = w;
  sharedCanvas.height = h;
  const ctx = sharedCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable in this browser.");
  return { canvas: sharedCanvas, ctx };
}

/** Draw the current video frame (or an image) into a w×h buffer. */
export function grabFrame(
  source: HTMLVideoElement | HTMLImageElement,
  w: number,
  h: number,
): ImageData {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sw || !sh) throw new Error("Frame not ready yet.");
  const { ctx } = canvas2d(w, h);
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Extract the face region (with padding) from a video frame at `size`×`size`. */
export function cropFace(
  video: HTMLVideoElement | HTMLImageElement,
  box: NormBox,
  size = 160,
  pad = 0.12,
): FaceCrop {
  const sw = video instanceof HTMLVideoElement ? video.videoWidth : video.naturalWidth;
  const sh = video instanceof HTMLVideoElement ? video.videoHeight : video.naturalHeight;
  if (!sw || !sh) throw new Error("Video not ready.");
  const bx = Math.max(0, (box.x - pad / 2) * sw);
  const by = Math.max(0, (box.y - pad / 2) * sh);
  const bw = Math.min(sw - bx, (box.width + pad) * sw);
  const bh = Math.min(sh - by, (box.height + pad) * sh);
  const { ctx } = canvas2d(size, size);
  ctx.drawImage(video, bx, by, bw, bh, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  return { data: img.data, width: size, height: size };
}

/** Small grayscale ROI snapshot for liveness motion comparison. */
export function grayRoi(video: HTMLVideoElement, box: NormBox, size = 48): Float32Array {
  const sw = video.videoWidth;
  const sh = video.videoHeight;
  if (!sw || !sh) return new Float32Array(size * size);
  const sx = Math.max(0, (box.x - box.width * 0.1) * sw);
  const sy = Math.max(0, (box.y - box.height * 0.1) * sh);
  const s = Math.min(Math.max(8, box.width * 1.2 * sw), sw - sx, Math.max(8, box.height * 1.2 * sh));
  const { ctx } = canvas2d(size, size);
  ctx.drawImage(video, sx, sy, s, s, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  return toGray(img.data, size, size);
}

/** Skin-tone ratio in a region — used by the fallback detector and framing guide. */
export function skinRatio(data: Uint8ClampedArray, step = 2): number {
  let hit = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    n++;
    if (r > 95 && g > 40 && b > 20 && mx - mn > 15 && Math.abs(r - g) > 12 && r > g && r > b) hit++;
  }
  return n ? hit / n : 0;
}

import { PaymentError } from "@/lib/payments/errors";
import { detectCodes, type DetectedCode } from "./decode";

/**
 * ---------------------------------------------------------------------------
 *  Decoding QR codes out of an uploaded image.
 * ---------------------------------------------------------------------------
 *  Photos of QR codes are messy: 12-megapixel camera rolls, screenshots with
 *  three codes on one poster, inverted dark-mode renders, WebP exports. This
 *  module normalises all of that into `DetectedCode[]` while keeping memory
 *  bounded — nothing is ever drawn larger than `MAX_DIMENSION`, and bitmaps are
 *  released as soon as their pixels have been read.
 * ---------------------------------------------------------------------------
 */

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
  "image/avif",
  "image/heic",
  "image/heif",
];

/** `accept` attribute for the file input. */
export const IMAGE_ACCEPT_ATTRIBUTE = `${ACCEPTED_IMAGE_TYPES.join(",")},image/*`;

/** Never rasterise beyond this on the longest side (caps memory + decode time). */
const MAX_DIMENSION = 2400;

/**
 * Scales to try, longest-side in pixels. Ordered by hit rate: a mid-size pass
 * reads most photos, full detail rescues small/dense codes inside large
 * pictures, and the small pass rescues blurry close-ups.
 */
const SCALE_PASSES = [1280, MAX_DIMENSION, 640];

export interface DecodeImageOptions {
  /** Find every code in the picture rather than stopping at the first. */
  multiple?: boolean;
  signal?: AbortSignal;
}

/**
 * Read every QR code in a user-supplied file.
 * @throws PaymentError `image_too_large` | `image_unsupported` | `image_corrupt`
 */
export async function decodeImageFile(
  file: File,
  options: DecodeImageOptions = {},
): Promise<DetectedCode[]> {
  assertUsableFile(file);

  const source = await loadImage(file);
  try {
    let best: DetectedCode[] = [];
    const attempted = new Set<string>();

    for (const target of SCALE_PASSES) {
      if (options.signal?.aborted) return best;

      const size = rasterSize(source, target);
      // Passes collapse to the same canvas for small images — don't redo work.
      const key = `${size.width}x${size.height}`;
      if (attempted.has(key)) continue;
      attempted.add(key);

      const imageData = rasterise(source, size);
      if (!imageData) continue;

      const codes = await detectCodes(imageData, { multiple: options.multiple });
      if (codes.length > best.length) best = codes;
      // One code is enough unless we were asked to find them all; when we were,
      // stop as soon as a pass sees more than one (it read the whole poster).
      if (best.length > 0 && (!options.multiple || best.length > 1)) break;

      // Let the browser paint between expensive passes.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return best;
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
    if ("src" in source && source.src.startsWith("blob:")) URL.revokeObjectURL(source.src);
  }
}

function assertUsableFile(file: File): void {
  if (file.size === 0) throw new PaymentError("image_corrupt");
  if (file.size > MAX_IMAGE_BYTES) throw new PaymentError("image_too_large");
  // Some pickers report an empty type; let those through and let the decoder
  // be the judge. A declared non-image type is rejected outright.
  if (file.type && !file.type.startsWith("image/")) {
    throw new PaymentError("image_unsupported");
  }
}

type DecodableImage = ImageBitmap | HTMLImageElement;

async function loadImage(file: File): Promise<DecodableImage> {
  if (typeof createImageBitmap === "function" && file.type !== "image/svg+xml") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through: some browsers can't bitmap every format they can render.
    }
  }
  return loadViaElement(file);
}

function loadViaElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PaymentError("image_corrupt"));
    };
    img.src = url;
  });
}

function dimensionsOf(source: DecodableImage): { width: number; height: number } {
  if ("naturalWidth" in source) {
    // A vector with no intrinsic size still needs a sane raster target.
    return {
      width: source.naturalWidth || source.width || 512,
      height: source.naturalHeight || source.height || 512,
    };
  }
  return { width: source.width, height: source.height };
}

interface RasterSize {
  width: number;
  height: number;
  downscaled: boolean;
}

/** Target canvas size for a pass. Never upscales — a 300px screenshot gains
 *  nothing from a 2400px canvas. */
function rasterSize(source: DecodableImage, targetLongestSide: number): RasterSize {
  const { width, height } = dimensionsOf(source);
  if (width === 0 || height === 0) throw new PaymentError("image_corrupt");
  const longest = Math.max(width, height);
  const scale = Math.min(1, Math.min(targetLongestSide, MAX_DIMENSION) / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    downscaled: scale < 1,
  };
}

/** Draw the image at the given size and hand back its pixels. */
function rasterise(source: DecodableImage, size: RasterSize): ImageData | null {
  const { width: w, height: h, downscaled } = size;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new PaymentError("image_corrupt");

  // White backdrop so transparent PNGs (very common for QR exports) decode as
  // dark-on-light instead of dark-on-black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = downscaled;
  ctx.imageSmoothingQuality = "high";

  try {
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    throw new PaymentError("image_corrupt");
  }
}

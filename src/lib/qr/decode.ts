/**
 * ---------------------------------------------------------------------------
 *  QR detection — native first, jsQR as the universal fallback.
 * ---------------------------------------------------------------------------
 *  `BarcodeDetector` is hardware-accelerated, finds *several* codes in one
 *  pass, and costs nothing to ship. It isn't everywhere (notably Safari and
 *  some desktop Chrome builds), so jsQR — pure JS, ~40 KB, lazily imported so
 *  it never touches the initial bundle — covers the rest.
 *
 *  Both paths return the same shape, so callers never branch on which engine
 *  ran.
 * ---------------------------------------------------------------------------
 */

export interface DetectedCode {
  value: string;
  /** Centre of the code in source-image pixels — used to draw the reticle. */
  center?: { x: number; y: number };
  corners?: { x: number; y: number }[];
}

/** The pixel shape both engines consume — `ImageData` satisfies it. */
interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource | ImageBitmap | ImageData): Promise<
    {
      rawValue: string;
      cornerPoints?: { x: number; y: number }[];
      boundingBox?: { x: number; y: number; width: number; height: number };
    }[]
  >;
}

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

let nativeDetector: BarcodeDetectorLike | null | undefined;
let jsQrLoader: Promise<typeof import("jsqr").default> | null = null;

/** Resolve (and cache) a native detector, or null when unsupported. */
async function getNativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (nativeDetector !== undefined) return nativeDetector;
  try {
    const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!ctor) {
      nativeDetector = null;
      return null;
    }
    // Some builds expose the constructor but not the QR format.
    const formats = (await ctor.getSupportedFormats?.()) ?? ["qr_code"];
    if (!formats.includes("qr_code")) {
      nativeDetector = null;
      return null;
    }
    nativeDetector = new ctor({ formats: ["qr_code"] });
  } catch {
    nativeDetector = null;
  }
  return nativeDetector;
}

async function getJsQr() {
  jsQrLoader ??= import("jsqr").then((m) => m.default);
  return jsQrLoader;
}

/** True when this device can decode without downloading the fallback. */
export async function hasNativeDetector(): Promise<boolean> {
  return (await getNativeDetector()) !== null;
}

/** Warm the decoder so the first frame after the camera opens isn't the slow one. */
export function preloadDecoder(): void {
  void getNativeDetector().then((native) => {
    if (!native) void getJsQr();
  });
}

function centerOf(corners?: { x: number; y: number }[]): { x: number; y: number } | undefined {
  if (!corners || corners.length === 0) return undefined;
  const sum = corners.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / corners.length, y: sum.y / corners.length };
}

/**
 * Decode every QR code visible in one frame.
 *
 * @param options.multiple  Try harder to find more than one code (upload path).
 *                          Camera frames pass false — the first hit wins and we
 *                          stop immediately.
 */
export async function detectCodes(
  image: ImageData,
  options: { multiple?: boolean } = {},
): Promise<DetectedCode[]> {
  const native = await getNativeDetector();
  if (native) {
    try {
      const results = await native.detect(image);
      const codes = results
        .map((r) => ({
          value: r.rawValue,
          corners: r.cornerPoints,
          center:
            centerOf(r.cornerPoints) ??
            (r.boundingBox
              ? {
                  x: r.boundingBox.x + r.boundingBox.width / 2,
                  y: r.boundingBox.y + r.boundingBox.height / 2,
                }
              : undefined),
        }))
        .filter((c) => c.value);
      if (codes.length > 0) return dedupe(codes);
    } catch {
      // A detector failure (e.g. a released ImageBitmap) shouldn't end the
      // scan — fall through to jsQR for this frame.
    }
  }

  const found = await detectWithJsQr(image, Boolean(options.multiple));

  // jsQR locates a single symbol per image, and its finder-pattern search can
  // fail outright when several codes compete in one frame (a poster with two
  // codes side by side).
  if (!options.multiple) {
    if (found.length > 0) return dedupe(found);
    // Camera path: retry inside the viewfinder window only. One extra pass,
    // and it resolves ambiguity the way the user expects — whatever they
    // framed wins.
    const centre = centreRegion(image);
    if (!centre) return [];
    const codes = await detectWithJsQr(cropRegion(image, centre), false);
    return dedupe(codes.map((code) => translate(code, centre)));
  }

  // Upload path: halves and quadrants isolate each code. Only paid for when
  // the whole-image pass didn't already find several.
  if (found.length >= 2) return dedupe(found);
  const regional = await detectInRegions(image);
  return dedupe([...found, ...regional]);
}

/** The on-screen framing window, in source pixels. */
function centreRegion(
  image: ImageDataLike,
): { x: number; y: number; w: number; h: number } | null {
  const w = Math.round(image.width * 0.7);
  const h = Math.round(image.height * 0.7);
  if (w < 24 || h < 24) return null;
  return {
    x: Math.round((image.width - w) / 2),
    y: Math.round((image.height - h) / 2),
    w,
    h,
  };
}

/** Move a code's coordinates from a crop back into the source frame. */
function translate(
  code: DetectedCode,
  region: { x: number; y: number },
): DetectedCode {
  return {
    value: code.value,
    corners: code.corners?.map((p) => ({ x: p.x + region.x, y: p.y + region.y })),
    center: code.center ? { x: code.center.x + region.x, y: code.center.y + region.y } : undefined,
  };
}

/** One decode pass over a buffer, optionally masking hits to find more. */
async function detectWithJsQr(image: ImageDataLike, multiple: boolean): Promise<DetectedCode[]> {
  const jsQR = await getJsQr();
  const found: DetectedCode[] = [];
  const working = multiple ? new Uint8ClampedArray(image.data) : image.data;

  for (let pass = 0; pass < (multiple ? 4 : 1); pass++) {
    const result = jsQR(working, image.width, image.height, {
      inversionAttempts: pass === 0 ? "attemptBoth" : "dontInvert",
    });
    if (!result) break;
    const corners = [
      result.location.topLeftCorner,
      result.location.topRightCorner,
      result.location.bottomRightCorner,
      result.location.bottomLeftCorner,
    ];
    found.push({ value: result.data, corners, center: centerOf(corners) });
    if (!multiple) break;
    maskRegion(working, image.width, image.height, corners);
  }
  return found;
}

/**
 * Slice the frame into overlapping halves and quadrants and decode each one.
 * Overlap matters: a code straddling the midline is whole inside at least one
 * region.
 */
async function detectInRegions(image: ImageDataLike): Promise<DetectedCode[]> {
  const { width: w, height: h } = image;
  const overlap = 0.12;
  const midW = Math.round(w * (0.5 + overlap));
  const midH = Math.round(h * (0.5 + overlap));
  const offX = w - midW;
  const offY = h - midH;

  const regions: { x: number; y: number; w: number; h: number }[] = [
    { x: 0, y: 0, w: midW, h },
    { x: offX, y: 0, w: midW, h },
    { x: 0, y: 0, w, h: midH },
    { x: 0, y: offY, w, h: midH },
    { x: 0, y: 0, w: midW, h: midH },
    { x: offX, y: 0, w: midW, h: midH },
    { x: 0, y: offY, w: midW, h: midH },
    { x: offX, y: offY, w: midW, h: midH },
  ];

  const found: DetectedCode[] = [];
  const seen = new Set<string>();
  for (const region of regions) {
    if (region.w < 24 || region.h < 24) continue;
    const crop = cropRegion(image, region);
    const codes = await detectWithJsQr(crop, false);
    for (const code of codes) {
      if (seen.has(code.value)) continue;
      seen.add(code.value);
      found.push(translate(code, region));
    }
  }
  return found;
}

function cropRegion(
  image: ImageDataLike,
  region: { x: number; y: number; w: number; h: number },
): ImageDataLike {
  const data = new Uint8ClampedArray(region.w * region.h * 4);
  for (let y = 0; y < region.h; y++) {
    const from = ((y + region.y) * image.width + region.x) * 4;
    data.set(image.data.subarray(from, from + region.w * 4), y * region.w * 4);
  }
  return { data, width: region.w, height: region.h };
}

/** Paint a detected code white so the next pass finds the *next* one. */
function maskRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  corners: { x: number; y: number }[],
): void {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const pad = 4;
  const minX = Math.max(0, Math.floor(Math.min(...xs)) - pad);
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs)) + pad);
  const minY = Math.max(0, Math.floor(Math.min(...ys)) - pad);
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys)) + pad);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
}

function dedupe(codes: DetectedCode[]): DetectedCode[] {
  const seen = new Set<string>();
  return codes.filter((c) => {
    if (seen.has(c.value)) return false;
    seen.add(c.value);
    return true;
  });
}

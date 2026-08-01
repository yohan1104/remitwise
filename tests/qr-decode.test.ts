import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { detectCodes } from "../src/lib/qr/decode";
import {
  buildToken,
  encodePayload,
  parseScannedValue,
  qrLink,
  type RequestPayload,
} from "../src/lib/payments/qr-format";

/**
 * End-to-end proof that a code RemitWise *renders* is a code RemitWise can
 * *read*: the payment QR is generated with the same component the app shows on
 * screen, rasterised, and fed to the production decoder.
 */

interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Render a QR with the app's component and turn it into raw RGBA pixels. */
function rasteriseQr(
  value: string,
  { scale = 4, quiet = 4, invert = false }: { scale?: number; quiet?: number; invert?: boolean } = {},
): Raster {
  const svg = renderToStaticMarkup(
    React.createElement(QRCodeSVG, { value, size: 200, level: "M", marginSize: 0 }),
  );
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  assert.ok(viewBox, "QR markup should expose a module-sized viewBox");
  const modules = Number(viewBox[1]);

  const darkPath = /<path fill="#000000" d="([^"]+)"/.exec(svg);
  assert.ok(darkPath, "QR markup should contain a dark-module path");

  const matrix: boolean[][] = Array.from({ length: modules }, () =>
    new Array<boolean>(modules).fill(false),
  );
  // qrcode.react emits one horizontal run per segment: `M{x} {y}h{w}v1H{x}z`.
  const runs = /M(\d+)[ ,](\d+)\s*h(\d+)/g;
  let run: RegExpExecArray | null;
  while ((run = runs.exec(darkPath[1])) !== null) {
    const [, xs, ys, ws] = run;
    const x = Number(xs);
    const y = Number(ys);
    for (let i = 0; i < Number(ws); i++) matrix[y][x + i] = true;
  }

  const side = (modules + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let py = 0; py < side; py++) {
    for (let px = 0; px < side; px++) {
      const mx = Math.floor(px / scale) - quiet;
      const my = Math.floor(py / scale) - quiet;
      const dark =
        my >= 0 && my < modules && mx >= 0 && mx < modules ? matrix[my][mx] : false;
      const level = (invert ? !dark : dark) ? 0 : 255;
      const offset = (py * side + px) * 4;
      data[offset] = level;
      data[offset + 1] = level;
      data[offset + 2] = level;
      data[offset + 3] = 255;
    }
  }
  return { data, width: side, height: side };
}

/** Paste one raster into another at (dx, dy) — builds multi-code test images. */
function compose(sources: Raster[], gap = 24): Raster {
  const height = Math.max(...sources.map((s) => s.height)) + gap * 2;
  const width = sources.reduce((sum, s) => sum + s.width + gap, gap);
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  let dx = gap;
  for (const source of sources) {
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const from = (y * source.width + x) * 4;
        const to = ((y + gap) * width + (x + dx)) * 4;
        data[to] = source.data[from];
        data[to + 1] = source.data[from + 1];
        data[to + 2] = source.data[from + 2];
        data[to + 3] = 255;
      }
    }
    dx += source.width + gap;
  }
  return { data, width, height };
}

/**
 * Put `code` in the middle of a larger frame, with partial codes intruding
 * from the edges — a realistic camera shot of a poster.
 */
function withCentredCode(code: Raster): Raster {
  const pad = Math.round(code.width * 0.35);
  const width = code.width + pad * 2;
  const height = code.height + pad * 2;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);

  // Noise blocks at the edges stand in for neighbouring content.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x < pad / 2 || x > width - pad / 2;
      if (!edge) continue;
      const dark = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0;
      const offset = (y * width + x) * 4;
      const level = dark ? 40 : 235;
      data[offset] = level;
      data[offset + 1] = level;
      data[offset + 2] = level;
    }
  }

  for (let y = 0; y < code.height; y++) {
    for (let x = 0; x < code.width; x++) {
      const from = (y * code.width + x) * 4;
      const to = ((y + pad) * width + (x + pad)) * 4;
      data[to] = code.data[from];
      data[to + 1] = code.data[from + 1];
      data[to + 2] = code.data[from + 2];
      data[to + 3] = 255;
    }
  }
  return { data, width, height };
}

const asImageData = (raster: Raster) => raster as unknown as ImageData;

function requestToken(overrides: Partial<RequestPayload> = {}): string {
  const payload: RequestPayload = {
    v: 1,
    t: "req",
    i: "cmsal0tcr0002vjrwms3smar0",
    n: "Demo User",
    a: 12.5,
    c: "USDC",
    m: "Lunch at Jollibee",
    x: Math.floor(Date.now() / 1000) + 3600,
    k: "Sybl4t-zi7kRdDZn",
    ...overrides,
  };
  return buildToken(encodePayload(payload), "HSTrqpbu4ML6fQvy_jbfCA");
}

test("a rendered payment QR decodes back into the same payment", async () => {
  const link = qrLink("https://remitwise.app", requestToken());
  const codes = await detectCodes(asImageData(rasteriseQr(link)));

  assert.equal(codes.length, 1);
  assert.equal(codes[0].value, link);

  const scan = parseScannedValue(codes[0].value);
  assert.equal(scan.kind, "rw_request");
  if (scan.kind !== "rw_request") throw new Error("unreachable");
  assert.equal(scan.payload.a, 12.5);
  assert.equal(scan.payload.n, "Demo User");
  assert.equal(scan.payload.m, "Lunch at Jollibee");
});

test("a bare wallet-address QR decodes", async () => {
  const address = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const codes = await detectCodes(asImageData(rasteriseQr(address)));
  assert.equal(codes[0]?.value, address);
  assert.equal(parseScannedValue(codes[0].value).kind, "address");
});

test("inverted (dark-mode) codes still decode", async () => {
  const address = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const codes = await detectCodes(asImageData(rasteriseQr(address, { invert: true })));
  assert.equal(codes[0]?.value, address);
});

test("a picture with several codes yields all of them", async () => {
  const first = qrLink("https://remitwise.app", requestToken());
  const second = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const poster = compose([rasteriseQr(first, { scale: 3 }), rasteriseQr(second, { scale: 3 })]);

  const codes = await detectCodes(asImageData(poster), { multiple: true });
  const values = codes.map((c) => c.value).sort();
  assert.deepEqual(values, [first, second].sort());

  // Coordinates are reported in the source image, not the internal crop.
  for (const code of codes) {
    assert.ok(code.center);
    assert.ok(code.center.x >= 0 && code.center.x <= poster.width);
    assert.ok(code.center.y >= 0 && code.center.y <= poster.height);
  }
});

test("the camera path locks onto the code the user framed", async () => {
  // Two codes in shot, one centred in the viewfinder: that one wins, and
  // scanning stops there rather than presenting a choice mid-scan.
  const wanted = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const frame = withCentredCode(rasteriseQr(wanted, { scale: 3 }));

  const codes = await detectCodes(asImageData(frame));
  assert.equal(codes.length, 1);
  assert.equal(codes[0].value, wanted);
});

test("a picture with no code decodes to nothing rather than throwing", async () => {
  const blank: Raster = {
    data: new Uint8ClampedArray(120 * 120 * 4).fill(255),
    width: 120,
    height: 120,
  };
  assert.deepEqual(await detectCodes(asImageData(blank), { multiple: true }), []);
});

test("detected codes carry a centre point for the on-screen reticle", async () => {
  const codes = await detectCodes(asImageData(rasteriseQr("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5")));
  const center = codes[0]?.center;
  assert.ok(center, "expected a centre point");
  assert.ok(center.x > 0 && center.y > 0);
});

/**
 * ---------------------------------------------------------------------------
 *  RemitWise QR payment codes — wire format, parsing and validation.
 * ---------------------------------------------------------------------------
 *  Pure and isomorphic (no node/browser-only APIs beyond btoa/atob, which both
 *  runtimes provide) so the scanner can pre-validate a code the instant the
 *  camera sees it, and the server can re-validate it authoritatively.
 *
 *  Four inbound formats are understood:
 *
 *    1. RemitWise token      RW1.<payload>.<sig>       (signed, tamper-proof)
 *    2. RemitWise link       https://host/qr/<token>   (same token, so a
 *                                                       generic phone camera
 *                                                       deep-links into the app)
 *    3. SEP-7 payment URI    web+stellar:pay?destination=…  (Stellar standard)
 *    4. Bare Stellar address G…                        (plain wallet QR)
 *
 *  Only (1) and (2) carry a signature. Everything a signed token asserts is
 *  still re-checked against the database server-side — the signature only
 *  proves the code was minted by this deployment and has not been edited.
 * ---------------------------------------------------------------------------
 */

import { PaymentError, type PaymentErrorCode } from "./errors";

export const QR_TOKEN_PREFIX = "RW1";
export const QR_VERSION = 1;

/** Hard cap on a scanned string before we even look at it. */
export const MAX_QR_LENGTH = 2048;
/** Display fields are snapshotted into the code — keep them short and safe. */
export const MAX_NAME_LENGTH = 40;
export const MAX_NOTE_LENGTH = 80;

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

/** A payee-generated request: "pay me (this amount) for (this reason)". */
export interface RequestPayload {
  v: typeof QR_VERSION;
  t: "req";
  /** PaymentRequest row id — the server is the authority on its state. */
  i: string;
  /** Payee display name (offline preview only). */
  n: string;
  /** Fixed amount in `c`; omitted for an open request the payer fills in. */
  a?: number;
  /** Asset code — USDC today. */
  c: string;
  /** Optional note from the payee. */
  m?: string;
  /** Expiry, seconds since epoch. */
  x: number;
  /** Random nonce binding this image to the row (replay/guess resistance). */
  k: string;
}

/** A payee's reusable personal code: "pay this address". */
export interface AddressPayload {
  v: typeof QR_VERSION;
  t: "adr";
  /** Stellar public key of the payee. */
  g: string;
  n: string;
  c: string;
  m?: string;
  k: string;
}

export type TokenPayload = RequestPayload | AddressPayload;

export type ScannedPayment =
  | { kind: "rw_request"; token: string; payload: RequestPayload }
  | { kind: "rw_address"; token: string; payload: AddressPayload }
  | {
      kind: "sep7";
      destination: string;
      amount?: number;
      assetCode?: string;
      assetIssuer?: string;
      memo?: string;
      label?: string;
      /** SEP-7 `network_passphrase`; absent means "the sender's default". */
      networkPassphrase?: string;
    }
  | { kind: "address"; destination: string };

/** How the payee was obtained — persisted on the Transfer row. */
export type TransferSource = "qr_request" | "qr_address" | "sep7" | "address";

export function sourceOf(scan: ScannedPayment): TransferSource {
  switch (scan.kind) {
    case "rw_request":
      return "qr_request";
    case "rw_address":
      return "qr_address";
    case "sep7":
      return "sep7";
    default:
      return "address";
  }
}

// ---------------------------------------------------------------------------
// base64url (isomorphic)
// ---------------------------------------------------------------------------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function encodePayload(payload: TokenPayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodePayload(encoded: string): TokenPayload | null {
  const bytes = base64UrlToBytes(encoded);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return validatePayload(parsed);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stellar StrKey validation (checksummed, no SDK import)
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** CRC16-XModem — the checksum Stellar's StrKey encoding uses. */
function crc16(data: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of data) {
    let code = (crc >>> 8) & 0xff;
    code ^= byte & 0xff;
    code ^= code >>> 4;
    crc = ((crc << 8) & 0xffff) ^ ((code << 12) & 0xffff) ^ ((code << 5) & 0xffff) ^ code;
  }
  return crc & 0xffff;
}

/**
 * True for a well-formed, checksum-valid Stellar ed25519 public key. Catching
 * a mis-decoded character here means we never build a payment to an address
 * that would be rejected (or worse, silently valid) on-chain.
 */
export function isValidStellarPublicKey(key: string): boolean {
  if (!/^G[A-Z2-7]{55}$/.test(key)) return false;
  const decoded = base32Decode(key);
  if (!decoded || decoded.length !== 35) return false;
  if (decoded[0] !== 0x30) return false; // version byte for ed25519 public key
  const expected = decoded[33] | (decoded[34] << 8); // little-endian
  return crc16(decoded.subarray(0, 33)) === expected;
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/** Strip control characters — display fields end up in the DOM and in memos. */
export function sanitizeText(value: string, max: number): string {
  return Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim()
    .slice(0, max);
}

/** Narrow untrusted JSON to a supported payload, or null. */
export function validatePayload(input: unknown): TokenPayload | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (raw.v !== QR_VERSION) return null;

  const asset = str(raw.c, 12);
  const nonce = str(raw.k, 64);
  const name = str(raw.n, MAX_NAME_LENGTH);
  if (!asset || !nonce || !name) return null;

  const note = raw.m === undefined ? undefined : str(raw.m, MAX_NOTE_LENGTH);
  if (raw.m !== undefined && note === null) return null;

  if (raw.t === "req") {
    const id = str(raw.i, 64);
    if (!id) return null;
    if (typeof raw.x !== "number" || !Number.isFinite(raw.x) || raw.x <= 0) return null;
    let amount: number | undefined;
    if (raw.a !== undefined) {
      if (typeof raw.a !== "number" || !Number.isFinite(raw.a) || raw.a <= 0) return null;
      amount = raw.a;
    }
    return {
      v: QR_VERSION,
      t: "req",
      i: id,
      n: sanitizeText(name, MAX_NAME_LENGTH),
      ...(amount === undefined ? {} : { a: amount }),
      c: asset,
      ...(note ? { m: sanitizeText(note, MAX_NOTE_LENGTH) } : {}),
      x: Math.floor(raw.x),
      k: nonce,
    };
  }

  if (raw.t === "adr") {
    const address = str(raw.g, 56);
    if (!address || !isValidStellarPublicKey(address)) return null;
    return {
      v: QR_VERSION,
      t: "adr",
      g: address,
      n: sanitizeText(name, MAX_NAME_LENGTH),
      c: asset,
      ...(note ? { m: sanitizeText(note, MAX_NOTE_LENGTH) } : {}),
      k: nonce,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Token + link helpers
// ---------------------------------------------------------------------------

/** `RW1.<payload>.<sig>` — signing happens server-side (see qr-sign.ts). */
export function buildToken(encodedPayload: string, signature: string): string {
  return `${QR_TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

export interface SplitToken {
  encodedPayload: string;
  signature: string;
}

export function splitToken(token: string): SplitToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [prefix, encodedPayload, signature] = parts;
  if (prefix !== QR_TOKEN_PREFIX) return null;
  if (!encodedPayload || !signature) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(encodedPayload)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  return { encodedPayload, signature };
}

/** The URL encoded into a QR image — scannable by any camera app. */
export function qrLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/qr/${token}`;
}

/** Pull a RemitWise token out of a link, or null when it isn't one. */
export function tokenFromLink(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const fromQuery = url.searchParams.get("qr");
  if (fromQuery && splitToken(fromQuery)) return fromQuery;

  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("qr");
  if (idx !== -1 && segments[idx + 1]) {
    const candidate = decodeURIComponent(segments[idx + 1]);
    if (splitToken(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// SEP-7
// ---------------------------------------------------------------------------

const SEP7_SCHEMES = ["web+stellar:", "stellar:"];

function parseSep7(value: string): ScannedPayment {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PaymentError("qr_malformed");
  }
  const operation = url.pathname.replace(/^\/+/, "").toLowerCase();
  if (operation !== "pay") {
    // `tx` (sign an arbitrary XDR) is deliberately unsupported: RemitWise
    // never signs a transaction it did not build itself.
    throw new PaymentError("qr_unsupported");
  }

  const params = url.searchParams;
  const destination = (params.get("destination") ?? "").trim();
  if (!isValidStellarPublicKey(destination)) throw new PaymentError("qr_malformed");

  const assetCode = params.get("asset_code")?.trim() || undefined;
  const assetIssuer = params.get("asset_issuer")?.trim() || undefined;
  if (assetIssuer && !isValidStellarPublicKey(assetIssuer)) {
    throw new PaymentError("qr_malformed");
  }

  const rawAmount = params.get("amount");
  let amount: number | undefined;
  if (rawAmount !== null && rawAmount.trim() !== "") {
    const parsed = Number(rawAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new PaymentError("qr_malformed");
    amount = parsed;
  }

  const memo = params.get("memo_type") === "text" || params.get("memo_type") === null
    ? params.get("memo")?.trim() || undefined
    : undefined;

  return {
    kind: "sep7",
    destination,
    amount,
    assetCode,
    assetIssuer,
    memo: memo ? sanitizeText(memo, MAX_NOTE_LENGTH) : undefined,
    label: params.get("msg")?.trim()
      ? sanitizeText(params.get("msg")!.trim(), MAX_NAME_LENGTH)
      : undefined,
    networkPassphrase: params.get("network_passphrase")?.trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse anything a scanner produced into a payment intent candidate.
 * Throws a typed {@link PaymentError} so the UI can show a specific message
 * and a recovery action instead of "invalid QR code".
 *
 * Structure only: signatures and database state are verified server-side.
 */
export function parseScannedValue(raw: string): ScannedPayment {
  const value = raw.trim();
  if (!value) throw new PaymentError("qr_unreadable");
  if (value.length > MAX_QR_LENGTH) throw new PaymentError("qr_unsupported");

  // 1) RemitWise link (any camera app can open it; we short-circuit the token).
  const linked = tokenFromLink(value);
  const tokenCandidate = linked ?? value;

  // 2) RemitWise signed token.
  if (tokenCandidate.startsWith(`${QR_TOKEN_PREFIX}.`)) {
    const parts = splitToken(tokenCandidate);
    if (!parts) throw new PaymentError("qr_malformed");
    const payload = decodePayload(parts.encodedPayload);
    if (!payload) throw new PaymentError("qr_malformed");
    if (payload.t === "req") {
      if (payload.x * 1000 < Date.now()) throw new PaymentError("qr_expired");
      return { kind: "rw_request", token: tokenCandidate, payload };
    }
    return { kind: "rw_address", token: tokenCandidate, payload };
  }

  // 3) SEP-7 URI.
  const lower = value.toLowerCase();
  if (SEP7_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    // `stellar:G…` (a bare address behind the scheme) is common in the wild.
    const stripped = value.slice(value.indexOf(":") + 1);
    if (isValidStellarPublicKey(stripped.trim())) {
      return { kind: "address", destination: stripped.trim() };
    }
    return parseSep7(value);
  }

  // 4) Bare Stellar address.
  if (isValidStellarPublicKey(value)) return { kind: "address", destination: value };

  // A URL we don't recognise is a different app's code, not a broken one.
  if (/^https?:\/\//i.test(value)) throw new PaymentError("qr_unsupported");
  throw new PaymentError("qr_unsupported");
}

/** Non-throwing variant for hot paths (per-frame camera detection). */
export function tryParseScannedValue(
  raw: string,
): { ok: true; value: ScannedPayment } | { ok: false; code: PaymentErrorCode } {
  try {
    return { ok: true, value: parseScannedValue(raw) };
  } catch (err) {
    if (err instanceof PaymentError) return { ok: false, code: err.code };
    return { ok: false, code: "qr_unreadable" };
  }
}

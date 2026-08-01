import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import {
  buildToken,
  encodePayload,
  decodePayload,
  splitToken,
  bytesToBase64Url,
  base64UrlToBytes,
  type TokenPayload,
} from "./qr-format";
import { PaymentError } from "./errors";

/**
 * ---------------------------------------------------------------------------
 *  QR token signing — HMAC-SHA256, truncated to 128 bits.
 * ---------------------------------------------------------------------------
 *  The signature proves a payment code was minted by this deployment and has
 *  not been edited since (swap the amount, swap the payee — the signature
 *  breaks). It is NOT an authorisation: the server still re-reads the payment
 *  request row and re-resolves the recipient before any money moves, so a
 *  perfectly-signed code for a cancelled request is still refused.
 *
 *  The key is derived from AUTH_SECRET under a distinct label so a QR
 *  signature can never be confused with a session token or a wallet key.
 * ---------------------------------------------------------------------------
 */

const SIGNATURE_BYTES = 16; // 128-bit tag — ample for a short-lived payment code
const KEY_LABEL = "remitwise.qr.v1";

function key(): Buffer {
  return createHmac("sha256", env.authSecret).update(KEY_LABEL).digest();
}

function sign(encodedPayload: string): string {
  const mac = createHmac("sha256", key()).update(encodedPayload).digest();
  return bytesToBase64Url(new Uint8Array(mac.subarray(0, SIGNATURE_BYTES)));
}

/** Constant-time comparison that tolerates length mismatches. */
function signatureMatches(expected: string, provided: string): boolean {
  const a = base64UrlToBytes(expected);
  const b = base64UrlToBytes(provided);
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Random nonce embedded in every code (binds an image to its row). */
export function createNonce(): string {
  return bytesToBase64Url(new Uint8Array(randomBytes(12)));
}

/** Serialize + sign a payload into a scannable `RW1.<payload>.<sig>` token. */
export function signPayload(payload: TokenPayload): string {
  const encoded = encodePayload(payload);
  return buildToken(encoded, sign(encoded));
}

/**
 * Verify a scanned token and return its payload.
 * @throws PaymentError `qr_malformed` | `qr_tampered`
 */
export function verifyToken(token: string): TokenPayload {
  const parts = splitToken(token);
  if (!parts) throw new PaymentError("qr_malformed");
  if (!signatureMatches(sign(parts.encodedPayload), parts.signature)) {
    throw new PaymentError("qr_tampered");
  }
  const payload = decodePayload(parts.encodedPayload);
  if (!payload) throw new PaymentError("qr_malformed");
  return payload;
}

import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import {
  bytesToBase64Url,
  base64UrlToBytes,
  type TransferSource,
} from "./qr-format";
import { PaymentError } from "./errors";

/**
 * ---------------------------------------------------------------------------
 *  Payment intents — the server's own answer, handed back to itself.
 * ---------------------------------------------------------------------------
 *  `/api/payments/qr/resolve` verifies a scanned code, resolves the recipient
 *  and quotes the fee, then signs that decision into a short-lived intent
 *  token. The review screen displays it; `/api/transfers` accepts *only* the
 *  token (plus an amount, when the request left it open).
 *
 *  Consequence: a tampered client cannot redirect a payment, change the payee,
 *  zero the fee or resurrect a stale quote — the only field it can influence is
 *  the amount, which is re-validated against the payer's live balance.
 * ---------------------------------------------------------------------------
 */

const TTL_SECONDS = 5 * 60;
const SIGNATURE_BYTES = 16;
const KEY_LABEL = "remitwise.intent.v1";

export interface PaymentIntent {
  v: 1;
  /** Bound to the payer — an intent is worthless in another session. */
  s: string;
  /** Destination Stellar address (already checksum-validated). */
  d: string;
  /** Recipient RemitWise user id, when the payee is on-platform. */
  r?: string;
  /** PaymentRequest id, when paying a request rather than an address. */
  q?: string;
  /** Amount locked by the request; absent means the payer chooses. */
  a?: number;
  /** Fee quoted at resolve time, in USDC. */
  f: number;
  /** Provenance of the payee, persisted onto the Transfer row. */
  o: TransferSource;
  /** Display name shown on the review screen. */
  n: string;
  /** Secondary identifier (masked email, truncated address). */
  h?: string;
  /** Note supplied by the payee. */
  m?: string;
  /** Expiry, seconds since epoch. */
  x: number;
  k: string;
}

function key(): Buffer {
  return createHmac("sha256", env.authSecret).update(KEY_LABEL).digest();
}

function sign(encoded: string): string {
  const mac = createHmac("sha256", key()).update(encoded).digest();
  return bytesToBase64Url(new Uint8Array(mac.subarray(0, SIGNATURE_BYTES)));
}

export function issueIntent(
  intent: Omit<PaymentIntent, "v" | "x" | "k">,
): { token: string; expiresAt: string } {
  const payload: PaymentIntent = {
    ...intent,
    v: 1,
    x: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    k: bytesToBase64Url(new Uint8Array(randomBytes(9))),
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return {
    token: `${encoded}.${sign(encoded)}`,
    expiresAt: new Date(payload.x * 1000).toISOString(),
  };
}

/**
 * Verify an intent token and confirm it belongs to this payer.
 * @throws PaymentError `intent_invalid` | `intent_expired`
 */
export function readIntent(token: string, senderId: string): PaymentIntent {
  const parts = token.split(".");
  if (parts.length !== 2) throw new PaymentError("intent_invalid");
  const [encoded, signature] = parts;

  const expected = base64UrlToBytes(sign(encoded));
  const provided = base64UrlToBytes(signature);
  if (!expected || !provided || expected.length !== provided.length) {
    throw new PaymentError("intent_invalid");
  }
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    throw new PaymentError("intent_invalid");
  }

  const bytes = base64UrlToBytes(encoded);
  if (!bytes) throw new PaymentError("intent_invalid");

  let intent: PaymentIntent;
  try {
    intent = JSON.parse(new TextDecoder().decode(bytes)) as PaymentIntent;
  } catch {
    throw new PaymentError("intent_invalid");
  }

  if (intent.v !== 1 || typeof intent.d !== "string" || typeof intent.s !== "string") {
    throw new PaymentError("intent_invalid");
  }
  // A token minted for someone else is invalid, not merely unauthorised —
  // don't leak that it exists.
  if (intent.s !== senderId) throw new PaymentError("intent_invalid");
  if (typeof intent.x !== "number" || intent.x * 1000 < Date.now()) {
    throw new PaymentError("intent_expired");
  }
  return intent;
}

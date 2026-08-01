import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { truncateKey } from "@/lib/utils";
import { getStellarConfig } from "@/lib/stellar/config";
import { makeHorizon } from "@/lib/stellar/chain";
import { verifyTrustline } from "@/lib/stellar/assets";
import { PaymentError } from "./errors";
import { verifyToken } from "./qr-sign";
import {
  parseScannedValue,
  sourceOf,
  sanitizeText,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  type ScannedPayment,
  type TransferSource,
} from "./qr-format";
import { issueIntent } from "./intent";
import { TRANSFER_MAX_USDC, TRANSFER_MIN_USDC, transferFeeUsdc } from "./fees";
import type { PaymentRecipientView, QrPaymentPreview } from "@/lib/types";

/**
 * ---------------------------------------------------------------------------
 *  Resolution — turn a scanned string into a reviewable, signed payment.
 * ---------------------------------------------------------------------------
 *  Everything the payer's device claims is re-derived here from the signature
 *  and the database. The output (recipient, amount, fee) is sealed into an
 *  intent token, so the confirmation step never has to trust the client again.
 * ---------------------------------------------------------------------------
 */

export interface ResolveInput {
  userId: string;
  /** Raw string produced by the scanner / decoder. */
  payload: string;
}

interface ResolvedRecipient extends PaymentRecipientView {
  userId: string | null;
}

export async function resolveScannedPayment(input: ResolveInput): Promise<QrPaymentPreview> {
  const wallet = await prisma.wallet.findUnique({ where: { userId: input.userId } });
  if (!wallet) throw new PaymentError("wallet_not_ready");
  if (!wallet.provisioned) throw new PaymentError("wallet_not_ready");

  const scan = parseScannedValue(input.payload);

  let recipient: ResolvedRecipient;
  let amount: number | null = null;
  let note: string | null = null;
  let requestId: string | null = null;
  const source: TransferSource = sourceOf(scan);

  switch (scan.kind) {
    case "rw_request": {
      // Re-verify the signature server-side: the client only checked shape.
      const payload = verifyToken(scan.token);
      if (payload.t !== "req") throw new PaymentError("qr_malformed");

      const request = await prisma.paymentRequest.findUnique({ where: { id: payload.i } });
      if (!request) throw new PaymentError("request_not_found");
      // The nonce binds this image to this row — a token minted for an older
      // (recycled) request id cannot be replayed against a newer one.
      if (request.nonce !== payload.k) throw new PaymentError("qr_tampered");
      if (request.status === "cancelled") throw new PaymentError("request_cancelled");
      if (request.status === "paid") throw new PaymentError("request_already_paid");
      if (request.status === "expired" || request.expiresAt.getTime() < Date.now()) {
        throw new PaymentError("qr_expired");
      }
      if (request.userId === input.userId) throw new PaymentError("qr_self_payment");

      recipient = await resolveRemitWiseUser(request.userId);
      amount = request.amount === null ? null : round2(request.amount);
      note = request.note;
      requestId = request.id;
      break;
    }

    case "rw_address": {
      const payload = verifyToken(scan.token);
      if (payload.t !== "adr") throw new PaymentError("qr_malformed");
      recipient = await resolveAddress(payload.g, input.userId, payload.n);
      note = payload.m ?? null;
      break;
    }

    case "sep7": {
      assertPayableAsset(scan);
      recipient = await resolveAddress(scan.destination, input.userId, scan.label);
      amount = scan.amount === undefined ? null : round2(scan.amount);
      if (amount !== null && (amount < TRANSFER_MIN_USDC || amount > TRANSFER_MAX_USDC)) {
        throw new PaymentError(amount < TRANSFER_MIN_USDC ? "amount_too_small" : "amount_too_large");
      }
      note = scan.memo ?? null;
      break;
    }

    default: {
      recipient = await resolveAddress(scan.destination, input.userId);
      break;
    }
  }

  const fee = transferFeeUsdc(recipient.isRemitWiseUser);
  const { token, expiresAt } = issueIntent({
    s: input.userId,
    d: recipient.address,
    ...(recipient.userId ? { r: recipient.userId } : {}),
    ...(requestId ? { q: requestId } : {}),
    ...(amount === null ? {} : { a: amount }),
    f: fee,
    o: source,
    n: recipient.name,
    ...(recipient.handle ? { h: recipient.handle } : {}),
    ...(note ? { m: note } : {}),
  });

  await audit({
    action: "transfer.resolved",
    userId: input.userId,
    amount: amount ?? undefined,
    detail: `${source} → ${recipient.name} (${truncateKey(recipient.address, 6, 6)})`,
  });

  return {
    intentToken: token,
    intentExpiresAt: expiresAt,
    recipient: {
      name: recipient.name,
      handle: recipient.handle,
      address: recipient.address,
      isRemitWiseUser: recipient.isRemitWiseUser,
    },
    amount,
    amountEditable: amount === null,
    asset: "USDC",
    note,
    feeUsdc: fee,
    source,
    availableBalance: round2(wallet.availableBalance),
    limits: { min: TRANSFER_MIN_USDC, max: TRANSFER_MAX_USDC },
    requestId,
  };
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

async function resolveRemitWiseUser(userId: string): Promise<ResolvedRecipient> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, wallet: { select: { publicKey: true, provisioned: true } } },
  });
  if (!user?.wallet) throw new PaymentError("recipient_not_found");
  if (!user.wallet.provisioned) throw new PaymentError("recipient_cannot_receive");
  return {
    userId: user.id,
    name: sanitizeText(user.name, MAX_NAME_LENGTH),
    handle: maskEmail(user.email),
    address: user.wallet.publicKey,
    isRemitWiseUser: true,
  };
}

/**
 * Resolve a Stellar address to a RemitWise account when we host it, otherwise
 * to an external destination — verified on-chain so we never build a payment
 * that would bounce for a missing USDC trustline.
 */
async function resolveAddress(
  address: string,
  payerId: string,
  fallbackName?: string,
): Promise<ResolvedRecipient> {
  const wallet = await prisma.wallet.findFirst({
    where: { publicKey: address },
    select: { userId: true, provisioned: true, user: { select: { name: true, email: true } } },
  });

  if (wallet) {
    if (wallet.userId === payerId) throw new PaymentError("qr_self_payment");
    if (!wallet.provisioned) throw new PaymentError("recipient_cannot_receive");
    return {
      userId: wallet.userId,
      name: sanitizeText(wallet.user.name, MAX_NAME_LENGTH),
      handle: maskEmail(wallet.user.email),
      address,
      isRemitWiseUser: true,
    };
  }

  const payer = await prisma.wallet.findUnique({
    where: { userId: payerId },
    select: { publicKey: true },
  });
  if (payer?.publicKey === address) throw new PaymentError("qr_self_payment");

  const cfg = getStellarConfig();
  const line = await verifyTrustline(
    makeHorizon(cfg.horizonUrl),
    address,
    cfg.usdc.code,
    cfg.usdc.issuer,
  ).catch(() => null);
  if (!line) throw new PaymentError("network_error");
  if (!line.exists || !line.authorized) throw new PaymentError("recipient_cannot_receive");

  return {
    userId: null,
    name: fallbackName ? sanitizeText(fallbackName, MAX_NAME_LENGTH) : "Stellar wallet",
    handle: truncateKey(address, 6, 6),
    address,
    isRemitWiseUser: false,
  };
}

/** SEP-7 codes must ask for the USDC we actually hold, on our network. */
function assertPayableAsset(scan: Extract<ScannedPayment, { kind: "sep7" }>): void {
  const cfg = getStellarConfig();
  if (scan.networkPassphrase && scan.networkPassphrase !== cfg.networkPassphrase) {
    throw new PaymentError("qr_wrong_network");
  }
  // No asset in a SEP-7 pay URI means native XLM, which RemitWise doesn't send.
  if (!scan.assetCode) throw new PaymentError("qr_unsupported_asset");
  if (scan.assetCode !== cfg.usdc.code) throw new PaymentError("qr_unsupported_asset");
  if (scan.assetIssuer && scan.assetIssuer !== cfg.usdc.issuer) {
    throw new PaymentError("qr_unsupported_asset");
  }
}

/** `maria@example.com` → `ma•••@example.com` — enough to recognise, not to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return sanitizeText(email, MAX_NOTE_LENGTH);
  const head = local.slice(0, 2);
  return `${head}${local.length > 2 ? "•••" : ""}@${domain}`;
}

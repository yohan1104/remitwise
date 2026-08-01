import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { PaymentError } from "./errors";
import { createNonce, signPayload } from "./qr-sign";
import {
  qrLink,
  sanitizeText,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  type RequestPayload,
} from "./qr-format";
import { TRANSFER_MAX_USDC, TRANSFER_MIN_USDC } from "./fees";
import type { PaymentRequestStatusView, PaymentRequestView } from "@/lib/types";
import type { PaymentRequest } from "@prisma/client";

/**
 * ---------------------------------------------------------------------------
 *  Payment requests — the payee side of a QR payment.
 * ---------------------------------------------------------------------------
 *  A request is a short-lived, signed "charge me" code. The row is the source
 *  of truth for whether it is still payable; the token is only a tamper-proof
 *  pointer to it. Requests expire on a clock (default 30 minutes) and, when
 *  single-use, are claimed atomically at payment time so the same image can
 *  never be paid twice.
 * ---------------------------------------------------------------------------
 */

export const REQUEST_TTL_DEFAULT_MINUTES = 30;
export const REQUEST_TTL_MIN_MINUTES = 5;
export const REQUEST_TTL_MAX_MINUTES = 1440;
/** Cap on live codes per user — bounds abuse of the generator. */
const MAX_ACTIVE_REQUESTS = 20;

export interface CreatePaymentRequestInput {
  userId: string;
  amount?: number;
  note?: string;
  expiresInMinutes?: number;
  singleUse?: boolean;
  /** Origin used to build the deep link inside the QR image. */
  origin: string;
}

export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
): Promise<PaymentRequestView> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { name: true, email: true },
  });
  const wallet = await prisma.wallet.findUnique({
    where: { userId: input.userId },
    select: { provisioned: true },
  });
  if (!wallet?.provisioned) throw new PaymentError("wallet_not_ready");

  let amount: number | null = null;
  if (input.amount !== undefined) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new PaymentError("amount_invalid");
    }
    if (input.amount < TRANSFER_MIN_USDC) throw new PaymentError("amount_too_small");
    if (input.amount > TRANSFER_MAX_USDC) throw new PaymentError("amount_too_large");
    amount = round2(input.amount);
  }

  await expireStaleRequests(input.userId);
  const live = await prisma.paymentRequest.count({
    where: { userId: input.userId, status: "active" },
  });
  if (live >= MAX_ACTIVE_REQUESTS) {
    throw new PaymentError(
      "rate_limited",
      "You already have 20 payment codes waiting. Cancel one before creating another.",
    );
  }

  const minutes = clampTtl(input.expiresInMinutes);
  const note = input.note ? sanitizeText(input.note, MAX_NOTE_LENGTH) : null;

  const row = await prisma.paymentRequest.create({
    data: {
      userId: input.userId,
      amount,
      note: note || null,
      nonce: createNonce(),
      expiresAt: new Date(Date.now() + minutes * 60_000),
      // A code that names its price is a one-off invoice; an open-amount code
      // is a tip jar the payee can keep showing. Callers can override.
      singleUse: input.singleUse ?? amount !== null,
      status: "active",
    },
  });

  await audit({
    action: "payment_request.created",
    userId: input.userId,
    amount: amount ?? undefined,
    detail: amount ? `QR request ${row.id}` : `Open QR request ${row.id}`,
  });

  return toView(row, sanitizeText(user.name, MAX_NAME_LENGTH), input.origin);
}

export async function listPaymentRequests(
  userId: string,
  origin: string,
): Promise<PaymentRequestView[]> {
  await expireStaleRequests(userId);
  const [user, rows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
    prisma.paymentRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const paid = await paidMetaFor(rows);
  return rows.map((row) =>
    toView(row, sanitizeText(user.name, MAX_NAME_LENGTH), origin, paid.get(row.id)),
  );
}

export async function getPaymentRequest(
  userId: string,
  id: string,
  origin: string,
): Promise<PaymentRequestView> {
  const row = await prisma.paymentRequest.findFirst({ where: { id, userId } });
  if (!row) throw new PaymentError("request_not_found");
  const fresh = await expireIfDue(row);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true },
  });
  const paid = await paidMetaFor([fresh]);
  return toView(fresh, sanitizeText(user.name, MAX_NAME_LENGTH), origin, paid.get(fresh.id));
}

export async function cancelPaymentRequest(userId: string, id: string): Promise<void> {
  const row = await prisma.paymentRequest.findFirst({ where: { id, userId } });
  if (!row) throw new PaymentError("request_not_found");
  if (row.status === "paid") throw new PaymentError("request_already_paid");

  // Guarded so a cancel racing a payment can't retract a settled request.
  const claimed = await prisma.paymentRequest.updateMany({
    where: { id, userId, status: "active" },
    data: { status: "cancelled" },
  });
  if (claimed.count === 0) {
    const current = await prisma.paymentRequest.findFirstOrThrow({ where: { id, userId } });
    if (current.status === "paid") throw new PaymentError("request_already_paid");
    return; // already cancelled/expired — cancelling is idempotent
  }
  await audit({ action: "payment_request.cancelled", userId, detail: id });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function clampTtl(minutes?: number): number {
  if (!minutes || !Number.isFinite(minutes)) return REQUEST_TTL_DEFAULT_MINUTES;
  return Math.min(REQUEST_TTL_MAX_MINUTES, Math.max(REQUEST_TTL_MIN_MINUTES, Math.floor(minutes)));
}

/** Flip lapsed rows to `expired` so listings and lookups agree with the clock. */
async function expireStaleRequests(userId: string): Promise<void> {
  await prisma.paymentRequest.updateMany({
    where: { userId, status: "active", expiresAt: { lt: new Date() } },
    data: { status: "expired" },
  });
}

async function expireIfDue(row: PaymentRequest): Promise<PaymentRequest> {
  if (row.status !== "active" || row.expiresAt.getTime() >= Date.now()) return row;
  const claimed = await prisma.paymentRequest.updateMany({
    where: { id: row.id, status: "active" },
    data: { status: "expired" },
  });
  return claimed.count > 0 ? { ...row, status: "expired" } : row;
}

interface PaidMeta {
  payer: string | null;
  /** What actually landed — an open request is settled at the payer's amount. */
  amount: number | null;
}

async function paidMetaFor(rows: PaymentRequest[]): Promise<Map<string, PaidMeta>> {
  const settled = rows.filter((r) => r.status === "paid");
  if (settled.length === 0) return new Map();

  const userIds = Array.from(
    new Set(settled.map((r) => r.paidByUserId).filter((id): id is string => Boolean(id))),
  );
  const transferIds = settled
    .map((r) => r.transferId)
    .filter((id): id is string => Boolean(id));

  const [users, transfers] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.transfer.findMany({
          where: { id: { in: transferIds } },
          select: { id: true, amount: true },
        })
      : Promise.resolve([]),
  ]);

  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const amountById = new Map(transfers.map((t) => [t.id, t.amount]));

  const out = new Map<string, PaidMeta>();
  for (const row of settled) {
    out.set(row.id, {
      payer: row.paidByUserId ? (nameById.get(row.paidByUserId) ?? null) : null,
      amount: row.transferId ? (amountById.get(row.transferId) ?? null) : null,
    });
  }
  return out;
}

/** Rebuild the signed token for a row. Deterministic — the nonce is stored. */
export function tokenForRequest(row: PaymentRequest, payeeName: string): string {
  const payload: RequestPayload = {
    v: 1,
    t: "req",
    i: row.id,
    n: payeeName,
    ...(row.amount === null ? {} : { a: round2(row.amount) }),
    c: row.asset,
    ...(row.note ? { m: row.note } : {}),
    x: Math.floor(row.expiresAt.getTime() / 1000),
    k: row.nonce,
  };
  return signPayload(payload);
}

function toView(
  row: PaymentRequest,
  payeeName: string,
  origin: string,
  paid?: PaidMeta,
): PaymentRequestView {
  const token = tokenForRequest(row, payeeName);
  return {
    id: row.id,
    amount: row.amount === null ? null : round2(row.amount),
    asset: row.asset,
    note: row.note,
    status: row.status as PaymentRequestStatusView,
    singleUse: row.singleUse,
    token,
    link: qrLink(origin, token),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    paidBy: paid?.payer ?? null,
    amountPaid: paid?.amount != null ? round2(paid.amount) : null,
  };
}

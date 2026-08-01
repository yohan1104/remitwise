import "server-only";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { TRANSACTION_TYPES } from "@/lib/constants";
import { addUsdc, subUsdc, round2 } from "@/lib/money";
import { truncateKey } from "@/lib/utils";
import { getStellarConfig } from "@/lib/stellar/config";
import { makeHorizon, submitPaymentsFeeBump } from "@/lib/stellar/chain";
import { verifyTrustline } from "@/lib/stellar/assets";
import { getUserSigner } from "@/lib/stellar/signing";
import { explorer } from "@/lib/stellar/soroban";
import { PaymentError } from "./errors";
import { readIntent } from "./intent";
import { assertTransferAmount, transferFeeUsdc } from "./fees";
import { sanitizeText, MAX_NOTE_LENGTH, type TransferSource } from "./qr-format";
import type { TransferStatusView, TransferView } from "@/lib/types";
import type { Transfer } from "@prisma/client";

/**
 * ---------------------------------------------------------------------------
 *  Transfer engine — spendable USDC, person to person.
 * ---------------------------------------------------------------------------
 *  Ordering is chosen so money can never be created or destroyed by a crash:
 *
 *    1. Verify the signed intent (recipient + fee are the server's own answer).
 *    2. Claim the payment request, if any — an atomic status flip, so two
 *       devices scanning the same single-use code race and exactly one wins.
 *    3. RESERVE: debit the sender and write the Transfer + sender ledger row in
 *       one database transaction, guarded by a compare-and-set on the balance
 *       we read. A concurrent payment can't spend the same dollars twice.
 *    4. SETTLE on-chain (user-signed, treasury fee-bumped).
 *    5. On success: mark completed, credit the recipient, write their ledger
 *       row. On failure: refund the reservation and release the request.
 *
 *  `idempotencyKey` is unique, so a double-tapped confirm button, a retried
 *  fetch, or a browser replaying the request all return the *same* transfer
 *  rather than sending twice.
 * ---------------------------------------------------------------------------
 */

export interface ExecuteTransferInput {
  userId: string;
  intentToken: string;
  /** Only used when the intent left the amount open. */
  amount?: number;
  note?: string;
  idempotencyKey: string;
}

/** Max attempts for the optimistic balance claim before we give up. */
const CLAIM_ATTEMPTS = 4;

export async function executeTransfer(input: ExecuteTransferInput): Promise<TransferView> {
  const intent = readIntent(input.intentToken, input.userId);

  // Resolve anything this payer left in doubt (a crash between the debit and
  // the on-chain submission) before deciding what this request means.
  await withUserLock(input.userId, () => reconcileStuckTransfers(input.userId));

  // Same key, same payment: return whatever that attempt produced.
  const existing = await prisma.transfer.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (existing.senderId !== input.userId) throw new PaymentError("intent_invalid");
    if (existing.status === "processing") throw new PaymentError("duplicate_submission");
    return toView(existing, await availableBalance(input.userId));
  }

  const requested = intent.a !== undefined ? intent.a : input.amount;
  if (requested === undefined) throw new PaymentError("amount_required");
  const amount = round2(assertTransferAmount(requested));
  // The fee is re-derived here, never taken from the client.
  const fee = transferFeeUsdc(Boolean(intent.r));
  if (round2(fee) !== round2(intent.f)) throw new PaymentError("intent_invalid");
  const total = addUsdc(amount, fee);

  const note = input.note
    ? sanitizeText(input.note, MAX_NOTE_LENGTH)
    : intent.m
      ? sanitizeText(intent.m, MAX_NOTE_LENGTH)
      : null;

  // Serialise a single payer's transfers within this instance so concurrent
  // taps queue instead of colliding on the balance CAS below.
  return withUserLock(input.userId, () =>
    runTransfer({
      senderId: input.userId,
      destination: intent.d,
      recipientId: intent.r ?? null,
      recipientName: intent.n,
      recipientHandle: intent.h ?? null,
      requestId: intent.q ?? null,
      source: intent.o,
      amount,
      fee,
      total,
      note,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

interface RunTransferInput {
  senderId: string;
  destination: string;
  recipientId: string | null;
  recipientName: string;
  recipientHandle: string | null;
  requestId: string | null;
  source: TransferSource;
  amount: number;
  fee: number;
  total: number;
  note: string | null;
  idempotencyKey: string;
}

async function runTransfer(input: RunTransferInput): Promise<TransferView> {
  const cfg = getStellarConfig();
  const horizon = makeHorizon(cfg.horizonUrl);

  const senderWallet = await prisma.wallet.findUnique({ where: { userId: input.senderId } });
  if (!senderWallet?.provisioned) throw new PaymentError("wallet_not_ready");
  if (senderWallet.publicKey === input.destination) throw new PaymentError("qr_self_payment");
  if (senderWallet.availableBalance + 1e-9 < input.total) {
    throw new PaymentError("insufficient_funds");
  }

  // Last check before funds move: the destination must still be able to hold
  // the asset (a trustline can be removed between resolve and confirm).
  const line = await verifyTrustline(horizon, input.destination, cfg.usdc.code, cfg.usdc.issuer);
  if (!line.exists || !line.authorized) throw new PaymentError("recipient_cannot_receive");
  if (line.headroom < input.amount) throw new PaymentError("recipient_cannot_receive");

  // --- 2) Claim the payment request (single-use replay guard) --------------
  const claimedRequest = input.requestId
    ? await claimPaymentRequest(input.requestId, input.senderId)
    : false;

  // --- 3) Reserve funds + create the transfer atomically -------------------
  let reserved: Reservation;
  try {
    reserved = await reserve(input, senderWallet.availableBalance);
  } catch (err) {
    if (claimedRequest) await releasePaymentRequest(input.requestId!);
    throw err;
  }
  const { transfer } = reserved;
  await audit({
    action: "transfer.created",
    userId: input.senderId,
    amount: input.total,
    detail: `${transfer.id} → ${truncateKey(input.destination, 6, 6)}`,
  });

  // --- 4) Settle on-chain --------------------------------------------------
  try {
    const signer = await getUserSigner(input.senderId);
    const payments = [
      { destination: input.destination, amount: input.amount.toFixed(7) },
    ];
    // The fee (external transfers only) settles to the treasury in the same
    // transaction, so the on-chain debit always equals the debit we mirrored.
    if (input.fee > 0) {
      payments.push({ destination: cfg.distributor.publicKey, amount: input.fee.toFixed(7) });
    }

    const { hash } = await submitPaymentsFeeBump({
      horizon,
      passphrase: cfg.networkPassphrase,
      sourceSecret: await signer.getSecret(),
      feeSourceSecret: cfg.distributor.secret,
      code: cfg.usdc.code,
      issuer: cfg.usdc.issuer,
      payments,
      memoText: transfer.id,
    });

    const settled = await settle(reserved, hash, input, claimedRequest);
    await audit({
      action: "transfer.completed",
      userId: input.senderId,
      amount: input.amount,
      txHash: hash,
      detail: `${input.recipientName} · ${truncateKey(input.destination, 6, 6)}`,
    });
    return toView(settled, await availableBalance(input.senderId));
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Payment failed.";
    await refund(reserved, input, reason, claimedRequest);
    await audit({
      action: "transfer.failed",
      userId: input.senderId,
      amount: input.amount,
      detail: reason.slice(0, 300),
    });
    console.error("[transfer] settlement failed", err);
    throw new PaymentError("transfer_failed");
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/**
 * Atomically flip a single-use request to `paid`. `updateMany` on the current
 * status is a compare-and-set: exactly one concurrent payer can win, so the
 * same QR image can never be charged twice.
 *
 * Returns true when this call claimed the request (and therefore owns
 * releasing it if the payment later fails).
 */
async function claimPaymentRequest(requestId: string, payerId: string): Promise<boolean> {
  const request = await prisma.paymentRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new PaymentError("request_not_found");
  if (request.status === "paid") throw new PaymentError("request_already_paid");
  if (request.status === "cancelled") throw new PaymentError("request_cancelled");
  if (request.expiresAt.getTime() < Date.now()) throw new PaymentError("qr_expired");
  // Reusable codes (an open-amount "tip jar") stay payable — the idempotency
  // key is what stops a single payer from double-submitting.
  if (!request.singleUse) return false;

  const claimed = await prisma.paymentRequest.updateMany({
    where: { id: requestId, status: "active" },
    data: { status: "paid", paidByUserId: payerId, paidAt: new Date() },
  });
  if (claimed.count === 0) throw new PaymentError("request_already_paid");
  return true;
}

async function releasePaymentRequest(requestId: string): Promise<void> {
  await prisma.paymentRequest.updateMany({
    where: { id: requestId, status: "paid", transferId: null },
    data: { status: "active", paidByUserId: null, paidAt: null },
  });
}

/**
 * Debit the sender and record the transfer in one database transaction.
 *
 * The balance is written with exact stroop arithmetic (never a float
 * `decrement`) and guarded by an equality match on the value we read, so a
 * concurrent debit invalidates the claim instead of silently overwriting it.
 * A concurrent *credit* (an arriving remittance) also invalidates it, hence
 * the bounded retry.
 */
interface Reservation {
  transfer: Transfer;
  /** The sender's pending ledger row, so settle/refund can target it by id. */
  senderTransactionId: string;
}

async function reserve(input: RunTransferInput, knownBalance: number): Promise<Reservation> {
  let balance = knownBalance;

  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    if (balance + 1e-9 < input.total) throw new PaymentError("insufficient_funds");
    const nextBalance = subUsdc(balance, input.total);

    try {
      return await prisma.$transaction(async (tx) => {
        const claimed = await tx.wallet.updateMany({
          where: { userId: input.senderId, availableBalance: balance },
          data: { availableBalance: nextBalance },
        });
        if (claimed.count === 0) throw new BalanceRaceError();

        const ledgerRow = await tx.transaction.create({
          data: {
            userId: input.senderId,
            type: TRANSACTION_TYPES.transfer_sent,
            amount: input.total,
            asset: "USDC",
            memo: transferMemo(input),
            status: "pending",
          },
        });

        const transfer = await tx.transfer.create({
          data: {
            senderId: input.senderId,
            recipientId: input.recipientId,
            recipientAddress: input.destination,
            recipientName: input.recipientName,
            recipientHandle: input.recipientHandle,
            amount: input.amount,
            feeUsdc: input.fee,
            totalUsdc: input.total,
            note: input.note,
            source: input.source,
            paymentRequestId: input.requestId,
            idempotencyKey: input.idempotencyKey,
            status: "processing",
            ledgerTransactionId: ledgerRow.id,
          },
        });

        return { transfer, senderTransactionId: ledgerRow.id };
      });
    } catch (err) {
      if (err instanceof BalanceRaceError) {
        const fresh = await prisma.wallet.findUnique({
          where: { userId: input.senderId },
          select: { availableBalance: true },
        });
        balance = fresh?.availableBalance ?? balance;
        continue;
      }
      if (isUniqueViolation(err)) throw new PaymentError("duplicate_submission");
      throw err;
    }
  }

  // Persistent contention: refuse rather than risk an unguarded write.
  throw new PaymentError(
    "duplicate_submission",
    "Your balance is changing right now. Please try again in a moment.",
  );
}

/** Mark completed, credit an on-platform recipient, write their ledger row. */
async function settle(
  reserved: Reservation,
  hash: string,
  input: RunTransferInput,
  claimedRequest: boolean,
): Promise<Transfer> {
  const { transfer, senderTransactionId } = reserved;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.transfer.update({
      where: { id: transfer.id },
      data: { status: "completed", stellarTxId: hash, completedAt: new Date() },
    });

    await tx.transaction.update({
      where: { id: senderTransactionId },
      data: { status: "completed", stellarTxId: hash },
    });

    if (claimedRequest && input.requestId) {
      await tx.paymentRequest.update({
        where: { id: input.requestId },
        data: { transferId: transfer.id },
      });
    }

    if (input.recipientId) {
      const sender = await tx.user.findUnique({
        where: { id: input.senderId },
        select: { name: true },
      });
      const recipientWallet = await tx.wallet.findUnique({
        where: { userId: input.recipientId },
        select: { availableBalance: true },
      });
      if (recipientWallet) {
        // A person-to-person payment is spendable money, not remittance
        // income, so it lands in full — the auto-save split stays reserved for
        // inbound remittances (see lib/savings/engine.ts).
        await tx.wallet.update({
          where: { userId: input.recipientId },
          data: { availableBalance: addUsdc(recipientWallet.availableBalance, input.amount) },
        });
      }
      await tx.transaction.create({
        data: {
          userId: input.recipientId,
          type: TRANSACTION_TYPES.transfer_received,
          amount: input.amount,
          asset: "USDC",
          sender: sender?.name ?? "RemitWise user",
          memo: input.note ?? "QR payment received",
          status: "completed",
          stellarTxId: hash,
        },
      });
    }

    return updated;
  });
}

/** Undo the reservation when settlement fails — the sender is made whole. */
async function refund(
  reserved: Reservation,
  input: RunTransferInput,
  reason: string,
  claimedRequest: boolean,
): Promise<void> {
  const { transfer, senderTransactionId } = reserved;
  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: input.senderId },
        select: { availableBalance: true },
      });
      if (wallet) {
        await tx.wallet.update({
          where: { userId: input.senderId },
          data: { availableBalance: addUsdc(wallet.availableBalance, input.total) },
        });
      }
      await tx.transfer.update({
        where: { id: transfer.id },
        data: { status: "failed", failureReason: reason.slice(0, 300) },
      });
      await tx.transaction.update({
        where: { id: senderTransactionId },
        data: { status: "failed" },
      });
    });
    if (claimedRequest && input.requestId) await releasePaymentRequest(input.requestId);
  } catch (err) {
    // A failed refund is the one state that needs a human: leave a loud trail.
    console.error("[transfer] REFUND FAILED", transfer.id, err);
    await audit({
      action: "transfer.failed",
      userId: input.senderId,
      amount: input.total,
      detail: `REFUND FAILED for transfer ${transfer.id} — manual reconciliation required`,
    });
  }
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/** Below this age a `processing` transfer is simply still in flight. */
const IN_DOUBT_AFTER_MS = 100_000;
/**
 * Past this age the on-chain transaction can no longer appear: the inner
 * transaction is built with a 90-second timeout, so anything not on the ledger
 * by now never will be.
 */
const UNRECOVERABLE_AFTER_MS = 240_000;

/**
 * Settle or refund transfers that were interrupted between the debit and the
 * confirmation.
 *
 * The on-chain memo is the transfer id, so the ledger itself tells us which
 * outcome actually happened — we never guess. Runs on the payer's next
 * payment attempt, which is when it matters to them.
 */
export async function reconcileStuckTransfers(userId: string): Promise<void> {
  const stuck = await prisma.transfer.findMany({
    where: {
      senderId: userId,
      status: "processing",
      createdAt: { lt: new Date(Date.now() - IN_DOUBT_AFTER_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  if (stuck.length === 0) return;

  const cfg = getStellarConfig();
  const horizon = makeHorizon(cfg.horizonUrl);
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { publicKey: true },
  });
  if (!wallet) return;

  let onChain: Map<string, string>;
  try {
    const page = await horizon
      .transactions()
      .forAccount(wallet.publicKey)
      .order("desc")
      .limit(100)
      .call();
    onChain = new Map(
      page.records
        .filter((r) => r.successful && r.memo_type === "text" && r.memo)
        .map((r) => [r.memo as string, r.hash]),
    );
  } catch (err) {
    // Without the ledger we cannot tell settled from failed — leave the rows
    // alone rather than risk a double refund.
    console.error("[transfer] reconciliation could not read Horizon", err);
    return;
  }

  for (const row of stuck) {
    const hash = onChain.get(row.id);
    if (hash) {
      await settleReconciled(row, hash);
      await audit({
        action: "transfer.completed",
        userId,
        amount: row.amount,
        txHash: hash,
        detail: `reconciled ${row.id}`,
      });
      continue;
    }
    if (Date.now() - row.createdAt.getTime() < UNRECOVERABLE_AFTER_MS) continue;

    await refundReconciled(row);
    await audit({
      action: "transfer.failed",
      userId,
      amount: row.totalUsdc,
      detail: `reconciled ${row.id} — never reached the ledger, funds returned`,
    });
  }
}

/** Apply the success path to a transfer we found on the ledger after the fact. */
async function settleReconciled(row: Transfer, hash: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.transfer.updateMany({
      where: { id: row.id, status: "processing" },
      data: { status: "completed", stellarTxId: hash, completedAt: new Date() },
    });
    if (claimed.count === 0) return; // another worker got there first

    if (row.ledgerTransactionId) {
      await tx.transaction.updateMany({
        where: { id: row.ledgerTransactionId },
        data: { status: "completed", stellarTxId: hash },
      });
    }
    if (row.paymentRequestId) {
      await tx.paymentRequest.updateMany({
        where: { id: row.paymentRequestId, transferId: null, status: "paid" },
        data: { transferId: row.id },
      });
    }
    if (row.recipientId) {
      const recipientWallet = await tx.wallet.findUnique({
        where: { userId: row.recipientId },
        select: { availableBalance: true },
      });
      if (recipientWallet) {
        await tx.wallet.update({
          where: { userId: row.recipientId },
          data: { availableBalance: addUsdc(recipientWallet.availableBalance, row.amount) },
        });
      }
      const sender = await tx.user.findUnique({
        where: { id: row.senderId },
        select: { name: true },
      });
      await tx.transaction.create({
        data: {
          userId: row.recipientId,
          type: TRANSACTION_TYPES.transfer_received,
          amount: row.amount,
          asset: "USDC",
          sender: sender?.name ?? "RemitWise user",
          memo: row.note ?? "QR payment received",
          status: "completed",
          stellarTxId: hash,
        },
      });
    }
  });
}

/** Return the reservation for a transfer that never reached the ledger. */
async function refundReconciled(row: Transfer): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.transfer.updateMany({
      where: { id: row.id, status: "processing" },
      data: {
        status: "failed",
        failureReason: "Payment was interrupted before it reached Stellar; your balance was restored.",
      },
    });
    if (claimed.count === 0) return;

    const wallet = await tx.wallet.findUnique({
      where: { userId: row.senderId },
      select: { availableBalance: true },
    });
    if (wallet) {
      await tx.wallet.update({
        where: { userId: row.senderId },
        data: { availableBalance: addUsdc(wallet.availableBalance, row.totalUsdc) },
      });
    }
    if (row.ledgerTransactionId) {
      await tx.transaction.updateMany({
        where: { id: row.ledgerTransactionId },
        data: { status: "failed" },
      });
    }
    if (row.paymentRequestId) {
      await tx.paymentRequest.updateMany({
        where: { id: row.paymentRequestId, status: "paid", transferId: null },
        data: { status: "active", paidByUserId: null, paidAt: null },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class BalanceRaceError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function transferMemo(input: {
  recipientName: string;
  recipientHandle: string | null;
  note: string | null;
}): string {
  const who = input.recipientHandle
    ? `${input.recipientName} (${input.recipientHandle})`
    : input.recipientName;
  return input.note ? `To ${who} · ${input.note}` : `To ${who}`;
}

/**
 * Per-user in-process mutex. Real mutual exclusion lives in the database
 * (the balance CAS and the unique idempotency key); this just stops one user's
 * concurrent taps from burning retries against each other.
 */
const locks = new Map<string, Promise<unknown>>();

function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(userId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  locks.set(
    userId,
    next.catch(() => undefined).finally(() => {
      if (locks.get(userId) === next) locks.delete(userId);
    }),
  );
  return next;
}

async function availableBalance(userId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { availableBalance: true },
  });
  return round2(wallet?.availableBalance ?? 0);
}

export function toView(row: Transfer, balanceAfter: number): TransferView {
  return {
    id: row.id,
    amount: round2(row.amount),
    feeUsdc: round2(row.feeUsdc),
    totalUsdc: round2(row.totalUsdc),
    asset: row.asset,
    note: row.note,
    recipient: {
      name: row.recipientName,
      handle: row.recipientHandle,
      address: row.recipientAddress,
      isRemitWiseUser: row.recipientId !== null,
    },
    source: row.source as TransferSource,
    status: row.status as TransferStatusView,
    stellarTxId: row.stellarTxId,
    explorerUrl: row.stellarTxId ? explorer().tx(row.stellarTxId) : null,
    failureReason: row.failureReason,
    balanceAfter,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}


import "server-only";
import { prisma } from "@/lib/prisma";
import { TRANSACTION_TYPES } from "@/lib/constants";
import { getAnchor } from "@/lib/anchors";
import {
  quoteWithdrawal,
  WITHDRAWAL_MIN_USDC,
  WITHDRAWAL_MAX_USDC,
} from "@/lib/anchors/quotes";
import { findRail, maskAccountNumber, normalizeAccountNumber } from "@/lib/anchors/rails";
import { getStellarConfig } from "@/lib/stellar/config";
import { makeHorizon, submitPaymentFeeBump } from "@/lib/stellar/chain";
import { verifyTrustline } from "@/lib/stellar/assets";
import { getUserSigner } from "@/lib/stellar/signing";
import { subUsdc, round7 } from "@/lib/money";
import { audit } from "@/lib/audit";
import type { WithdrawalStatusView, WithdrawalView } from "@/lib/types";
import type { Withdrawal } from "@prisma/client";

/**
 * ---------------------------------------------------------------------------
 *  Withdrawal engine — USDC → local bank / e-wallet via the anchor off-ramp.
 * ---------------------------------------------------------------------------
 *  Lifecycle:
 *    1. Quote is locked (FX + fees snapshotted onto the row).
 *    2. Anchor session opens; it tells us its settlement address + memo.
 *    3. The user's USDC moves on-chain to the anchor (user-signed payment,
 *       treasury pays the network fee — users hold zero XLM).
 *    4. The anchor converts and pays out on local rails; we track its status
 *       until `completed` / `failed`. The DB row is a full audit snapshot.
 *
 *  Balances are debited only after the on-chain payment succeeds; a failure
 *  before that leaves a `failed` row and an untouched balance.
 * ---------------------------------------------------------------------------
 */

export interface CreateWithdrawalInput {
  userId: string;
  amountUsdc: number;
  railCode: string;
  accountName: string;
  accountNumber: string;
}

const TERMINAL: WithdrawalStatusView[] = ["completed", "failed"];

export async function createWithdrawal(input: CreateWithdrawalInput): Promise<WithdrawalView> {
  const amount = round7(input.amountUsdc);
  if (amount < WITHDRAWAL_MIN_USDC) {
    throw new Error(`Minimum withdrawal is $${WITHDRAWAL_MIN_USDC} USDC.`);
  }
  if (amount > WITHDRAWAL_MAX_USDC) {
    throw new Error(`Maximum withdrawal is $${WITHDRAWAL_MAX_USDC.toLocaleString()} USDC.`);
  }

  const found = findRail(input.railCode);
  if (!found) throw new Error("Unsupported payout destination.");
  const accountNumber = normalizeAccountNumber(input.accountNumber);
  if (!found.rail.accountPattern.test(accountNumber)) {
    throw new Error(`That doesn't look like a valid ${found.rail.name} ${found.rail.kind === "ewallet" ? "mobile number" : "account number"} (${found.rail.accountHint}).`);
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
  if (!wallet.provisioned) throw new Error("Wallet is not yet activated on Stellar.");
  if (wallet.availableBalance < amount) {
    throw new Error("Insufficient available balance.");
  }

  // 1) Lock the quote.
  const quote = await quoteWithdrawal(amount, input.railCode);

  // 2) Create the row first — its id is the reference that ties the anchor
  //    session and the on-chain memo back to this withdrawal.
  const row = await prisma.withdrawal.create({
    data: {
      userId: input.userId,
      amountUsdc: amount,
      feeUsdc: quote.feeUsdc,
      fxRate: quote.fxRate,
      fxSource: quote.fxSource,
      payoutPhp: quote.payoutFiat,
      railCode: found.rail.code,
      railName: found.rail.name,
      accountName: input.accountName.trim(),
      accountNumber,
      status: "pending_anchor",
    },
  });

  try {
    // 3) Open the anchor session and verify its settlement account can
    //    actually receive USDC before any funds move.
    const anchor = getAnchor();
    const session = await anchor.initiateWithdrawal({
      amountUsdc: amount,
      fiatCurrency: quote.fiatCurrency,
      railCode: found.rail.code,
      accountName: input.accountName.trim(),
      accountNumber,
      reference: row.id,
    });

    const cfg = getStellarConfig();
    const horizon = makeHorizon(cfg.horizonUrl);
    const line = await verifyTrustline(horizon, session.settlementAddress, cfg.usdc.code, cfg.usdc.issuer);
    if (!line.exists || !line.authorized) {
      throw new Error("Anchor settlement account cannot receive USDC right now. Try again shortly.");
    }

    // 4) Move the USDC on-chain: user-signed, treasury fee-bumped.
    const signer = await getUserSigner(input.userId);
    const { hash } = await submitPaymentFeeBump({
      horizon,
      passphrase: cfg.networkPassphrase,
      sourceSecret: await signer.getSecret(),
      feeSourceSecret: cfg.distributor.secret,
      destination: session.settlementAddress,
      code: cfg.usdc.code,
      issuer: cfg.usdc.issuer,
      amount: amount.toFixed(7),
      memoText: session.settlementMemo,
    });

    // 5) Mirror the debit + record the transaction atomically.
    const updated = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.update({
        where: { id: row.id },
        data: { anchorRef: session.id, stellarTxId: hash },
      });
      await tx.wallet.update({
        where: { userId: input.userId },
        data: { availableBalance: subUsdc(wallet.availableBalance, amount, { floorZero: true }) },
      });
      await tx.transaction.create({
        data: {
          userId: input.userId,
          type: TRANSACTION_TYPES.cash_out,
          amount,
          asset: "USDC",
          memo: `Cash-out to ${found.rail.name} ${maskAccountNumber(accountNumber)}`,
          status: "pending",
          stellarTxId: hash,
        },
      });
      return w;
    });

    await audit({
      action: "withdrawal.created",
      userId: input.userId,
      amount,
      txHash: hash,
      detail: `${found.rail.name} ${maskAccountNumber(accountNumber)} → ₱${quote.payoutFiat.toLocaleString()}`,
    });

    return toView(updated);
  } catch (err) {
    // Nothing moved (or the anchor refused): keep the attempt as an audit
    // record, balance untouched.
    const reason = err instanceof Error ? err.message : "Withdrawal failed.";
    const failed = await prisma.withdrawal.update({
      where: { id: row.id },
      data: { status: "failed", failureReason: reason },
    });
    await audit({ action: "withdrawal.failed", userId: input.userId, amount, detail: reason });
    void failed;
    throw err instanceof Error ? err : new Error(reason);
  }
}

/**
 * Refresh a withdrawal from the anchor and persist any transition. Status
 * updates are guarded (`updateMany` on the previous status) so concurrent
 * polls can't double-apply a completion.
 */
export async function syncWithdrawal(row: Withdrawal): Promise<Withdrawal> {
  if (TERMINAL.includes(row.status as WithdrawalStatusView) || !row.anchorRef) return row;

  const anchor = getAnchor();
  const session = await anchor.getWithdrawalStatus(row.anchorRef, row.createdAt);
  if (session.status === row.status) return row;

  const now = new Date();
  const data: Partial<Withdrawal> =
    session.status === "completed"
      ? { status: "completed", completedAt: now }
      : session.status === "failed"
        ? { status: "failed", failureReason: session.failureReason ?? "Anchor reported a failure." }
        : { status: session.status };

  const claimed = await prisma.withdrawal.updateMany({
    where: { id: row.id, status: row.status },
    data,
  });
  if (claimed.count === 0) {
    // Another request already applied a transition; read the fresh row.
    return prisma.withdrawal.findUniqueOrThrow({ where: { id: row.id } });
  }

  if (session.status === "completed" || session.status === "failed") {
    if (row.stellarTxId) {
      await prisma.transaction.updateMany({
        where: { stellarTxId: row.stellarTxId, type: TRANSACTION_TYPES.cash_out },
        data: { status: session.status === "completed" ? "completed" : "failed" },
      });
    }
    await audit({
      action: `withdrawal.${session.status}`,
      userId: row.userId,
      amount: row.amountUsdc,
      txHash: row.stellarTxId ?? undefined,
      detail: `${row.railName} · ₱${row.payoutPhp.toLocaleString()}`,
    });
  }

  return prisma.withdrawal.findUniqueOrThrow({ where: { id: row.id } });
}

/** List a user's withdrawals, refreshing any that are still in flight. */
export async function listWithdrawals(userId: string): Promise<WithdrawalView[]> {
  const rows = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const fresh = await Promise.all(
    rows.map((r) => (TERMINAL.includes(r.status as WithdrawalStatusView) ? r : syncWithdrawal(r))),
  );
  return fresh.map(toView);
}

export async function getWithdrawal(userId: string, id: string): Promise<WithdrawalView> {
  const row = await prisma.withdrawal.findFirstOrThrow({ where: { id, userId } });
  return toView(await syncWithdrawal(row));
}

function toView(w: Withdrawal): WithdrawalView {
  const rail = findRail(w.railCode);
  return {
    id: w.id,
    amountUsdc: w.amountUsdc,
    feeUsdc: w.feeUsdc,
    fxRate: w.fxRate,
    fxSource: (w.fxSource as WithdrawalView["fxSource"]) ?? "reference",
    payoutPhp: w.payoutPhp,
    fiatCurrency: rail?.corridor.currency ?? "PHP",
    railCode: w.railCode,
    railName: w.railName,
    accountMasked: maskAccountNumber(w.accountNumber),
    accountName: w.accountName,
    status: w.status as WithdrawalStatusView,
    stellarTxId: w.stellarTxId,
    failureReason: w.failureReason,
    eta: rail?.rail.eta ?? "1–2 banking days",
    createdAt: w.createdAt.toISOString(),
    completedAt: w.completedAt ? w.completedAt.toISOString() : null,
  };
}

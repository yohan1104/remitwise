import "server-only";
import { prisma } from "@/lib/prisma";
import { getAnchor } from "@/lib/anchors";
import { quoteDeposit, DEPOSIT_MAX_USD } from "@/lib/anchors/quotes";
import { findSenderCurrency } from "@/lib/anchors/currencies";
import { receiveRemittance } from "@/lib/savings/engine";
import { audit } from "@/lib/audit";
import type { DepositIntentView, DepositStatusView } from "@/lib/types";
import type { DepositIntent } from "@prisma/client";

/**
 * ---------------------------------------------------------------------------
 *  Deposit engine — sender's bank fiat → USDC → recipient's savings split.
 * ---------------------------------------------------------------------------
 *  The recipient (or sender, via a shared link) opens a deposit intent with a
 *  locked quote. The sender pays fiat on the anchor's interactive page; when
 *  the anchor confirms, settlement runs through `receiveRemittance` — the same
 *  on-chain vault path as every other remittance, so auto-savings, goals, and
 *  the audit trail behave identically regardless of how money entered.
 *
 *  Settlement is idempotent: an intent can only move `awaiting_payment →
 *  processing` once (atomic claim), and a completed intent stores the
 *  resulting transaction for permanent traceability.
 * ---------------------------------------------------------------------------
 */

const INTENT_TTL_MS = 24 * 60 * 60 * 1000; // unpaid intents expire after 24h

export async function createDepositIntent(input: {
  userId: string;
  amountFiat: number;
  fiatCurrency: string;
  senderName?: string;
}): Promise<DepositIntentView> {
  const currency = findSenderCurrency(input.fiatCurrency);
  if (!currency) throw new Error("Unsupported sender currency.");

  const quote = quoteDeposit(input.amountFiat, currency.code);
  if (quote.amountUsdc > DEPOSIT_MAX_USD) {
    throw new Error(`Maximum transfer is $${DEPOSIT_MAX_USD.toLocaleString()} per deposit.`);
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
  if (!wallet.provisioned) throw new Error("Activate your wallet before requesting a transfer.");

  const row = await prisma.depositIntent.create({
    data: {
      userId: input.userId,
      amountFiat: quote.amountFiat,
      fiatCurrency: quote.fiatCurrency,
      feeFiat: quote.feeFiat,
      fxRate: quote.fxRate,
      amountUsdc: quote.amountUsdc,
      senderName: input.senderName?.trim() || null,
      status: "awaiting_payment",
    },
  });

  const anchor = getAnchor();
  const session = await anchor.initiateDeposit({
    destinationPublicKey: wallet.publicKey,
    amountFiat: quote.amountFiat,
    fiatCurrency: quote.fiatCurrency,
    reference: row.id,
  });

  const updated = await prisma.depositIntent.update({
    where: { id: row.id },
    data: { anchorRef: session.id, interactiveUrl: session.interactiveUrl },
  });

  await audit({
    action: "deposit.intent_created",
    userId: input.userId,
    amount: quote.amountUsdc,
    detail: `${quote.fiatCurrency} ${quote.amountFiat} via ${anchor.name}`,
  });

  return toView(updated);
}

/**
 * Settle a paid deposit. Called when the sender completes the interactive
 * payment (mock anchor: the /pay page's confirm action; real anchor: its
 * webhook/poll reporting `completed`). Exactly-once via an atomic claim.
 */
export async function settleDeposit(id: string): Promise<DepositIntentView> {
  const claimed = await prisma.depositIntent.updateMany({
    where: { id, status: "awaiting_payment" },
    data: { status: "processing" },
  });
  if (claimed.count === 0) {
    // Someone else claimed it (or it's terminal) — report current state.
    const current = await prisma.depositIntent.findUniqueOrThrow({ where: { id } });
    return toView(current);
  }

  const intent = await prisma.depositIntent.findUniqueOrThrow({ where: { id } });
  try {
    const result = await receiveRemittance({
      userId: intent.userId,
      amount: intent.amountUsdc,
      sender: intent.senderName ?? `${intent.fiatCurrency} bank transfer`,
      memo: `On-ramp ${intent.fiatCurrency} → USDC [dep:${intent.id}]`,
    });

    const done = await prisma.depositIntent.update({
      where: { id },
      data: {
        status: "completed",
        stellarTxId: result.stellarTxId,
        transactionId: result.transactionId,
        completedAt: new Date(),
      },
    });
    await audit({
      action: "deposit.completed",
      userId: intent.userId,
      amount: intent.amountUsdc,
      txHash: result.stellarTxId,
      detail: `${intent.fiatCurrency} ${intent.amountFiat} settled on-chain`,
    });
    return toView(done);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Settlement failed.";
    const failed = await prisma.depositIntent.update({
      where: { id },
      data: { status: "failed", failureReason: reason },
    });
    await audit({ action: "deposit.failed", userId: intent.userId, amount: intent.amountUsdc, detail: reason });
    return toView(failed);
  }
}

/** Refresh an intent (expiry for stale unpaid ones; anchor poll for sep24). */
export async function syncDeposit(row: DepositIntent): Promise<DepositIntent> {
  if (row.status === "awaiting_payment" && Date.now() - row.createdAt.getTime() > INTENT_TTL_MS) {
    const claimed = await prisma.depositIntent.updateMany({
      where: { id: row.id, status: "awaiting_payment" },
      data: { status: "expired" },
    });
    if (claimed.count > 0) return prisma.depositIntent.findUniqueOrThrow({ where: { id: row.id } });
  }
  return row;
}

export async function listDeposits(userId: string): Promise<DepositIntentView[]> {
  const rows = await prisma.depositIntent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const fresh = await Promise.all(rows.map(syncDeposit));
  return fresh.map(toView);
}

export async function getDeposit(userId: string, id: string): Promise<DepositIntentView> {
  const row = await prisma.depositIntent.findFirstOrThrow({ where: { id, userId } });
  return toView(await syncDeposit(row));
}

/**
 * Public projection for the sender-facing /pay page. Deliberately minimal:
 * the intent id is an unguessable capability, and even so we expose only what
 * the sender needs — never the recipient's email, wallet, or balances.
 */
export async function getDepositForSender(id: string): Promise<
  | (DepositIntentView & { recipientFirstName: string })
  | null
> {
  const row = await prisma.depositIntent.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!row) return null;
  const fresh = await syncDeposit(row);
  return {
    ...toView(fresh),
    recipientFirstName: row.user.name.split(" ")[0] ?? "the recipient",
  };
}

function toView(d: DepositIntent): DepositIntentView {
  return {
    id: d.id,
    amountFiat: d.amountFiat,
    fiatCurrency: d.fiatCurrency,
    feeFiat: d.feeFiat,
    fxRate: d.fxRate,
    amountUsdc: d.amountUsdc,
    senderName: d.senderName,
    status: d.status as DepositStatusView,
    interactiveUrl: d.interactiveUrl,
    stellarTxId: d.stellarTxId,
    failureReason: d.failureReason,
    createdAt: d.createdAt.toISOString(),
    completedAt: d.completedAt ? d.completedAt.toISOString() : null,
  };
}

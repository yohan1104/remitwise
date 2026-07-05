import "server-only";
import { prisma } from "@/lib/prisma";
import { TRANSACTION_TYPES } from "@/lib/constants";
import { getWalletSecret } from "@/lib/stellar/service";
import {
  depositRemittance,
  depositSavings,
  withdrawSavings,
  setUserRate,
  explorer,
} from "@/lib/stellar/soroban";
import type { Prisma } from "@prisma/client";

/**
 * ---------------------------------------------------------------------------
 *  SavingsEngine — now settles ON-CHAIN via the Soroban savings-vault.
 * ---------------------------------------------------------------------------
 *  Every remittance is a real Stellar transaction: the treasury sends USDC and
 *  the vault contract enforces the savings split atomically. The database is a
 *  fast-read mirror of the resulting on-chain state (with the real tx hash);
 *  goal earmarking is an off-chain view over the on-chain savings pool.
 * ---------------------------------------------------------------------------
 */

export interface ReceiveRemittanceInput {
  userId: string;
  amount: number;
  sender?: string;
  memo?: string;
}

export interface RemittanceResult {
  transactionId: string;
  amount: number;
  savedAmount: number;
  availableAmount: number;
  savingsRate: number;
  newAvailableBalance: number;
  newSavingsBalance: number;
  stellarTxId: string;
  explorerUrl: string;
  goalsUpdated: { id: string; name: string; added: number; completed: boolean }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

export class WalletNotProvisionedError extends Error {}

export async function receiveRemittance(input: ReceiveRemittanceInput): Promise<RemittanceResult> {
  const { userId } = input;
  const amount = round7(input.amount);
  if (!(amount > 0)) throw new Error("Remittance amount must be positive.");

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  if (!wallet.provisioned) {
    throw new WalletNotProvisionedError("Wallet is not yet activated on Stellar.");
  }

  // 1) Settle on-chain — the contract enforces the split.
  const onchain = await depositRemittance(wallet.publicKey, amount);
  const savedAmount = round7(onchain.saved);
  const availableAmount = round7(onchain.available);

  // 2) Mirror the resulting state in the DB (source of truth is the chain).
  const newAvailableBalance = round7(wallet.availableBalance + availableAmount);
  const newSavingsBalance = round7(wallet.savingsBalance + savedAmount);

  const { transactionId, goalsUpdated } = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId },
      data: { availableBalance: newAvailableBalance, savingsBalance: newSavingsBalance },
    });
    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: TRANSACTION_TYPES.remittance_received,
        amount,
        asset: "USDC",
        sender: input.sender,
        memo: input.memo,
        savedAmount,
        availableAmount,
        stellarTxId: onchain.hash,
      },
    });
    const goalsUpdated = await earmarkSavingsToGoals(tx, userId, savedAmount);
    return { transactionId: transaction.id, goalsUpdated };
  });

  return {
    transactionId,
    amount,
    savedAmount,
    availableAmount,
    savingsRate: amount > 0 ? round2(savedAmount / amount) : 0,
    newAvailableBalance,
    newSavingsBalance,
    stellarTxId: onchain.hash,
    explorerUrl: explorer().tx(onchain.hash),
    goalsUpdated,
  };
}

async function earmarkSavingsToGoals(tx: Prisma.TransactionClient, userId: string, amount: number) {
  const goals = await tx.goal.findMany({
    where: { userId, isCompleted: false },
    orderBy: { createdAt: "asc" },
  });
  const active = goals.filter((g) => g.currentAmount < g.targetAmount);
  if (active.length === 0 || amount <= 0) return [];

  const totalRemaining = active.reduce((s, g) => s + (g.targetAmount - g.currentAmount), 0);
  let pool = amount;
  const updated: { id: string; name: string; added: number; completed: boolean }[] = [];

  for (let i = 0; i < active.length; i++) {
    const goal = active[i];
    const remaining = goal.targetAmount - goal.currentAmount;
    const share =
      i === active.length - 1
        ? Math.min(pool, remaining)
        : Math.min(round2((remaining / totalRemaining) * amount), remaining, pool);
    if (share <= 0) continue;
    const newCurrent = round2(goal.currentAmount + share);
    const completed = newCurrent >= goal.targetAmount;
    pool = round2(pool - share);
    await tx.goal.update({
      where: { id: goal.id },
      data: { currentAmount: newCurrent, isCompleted: completed },
    });
    updated.push({ id: goal.id, name: goal.name, added: share, completed });
  }
  return updated;
}

/** Manually move spendable USDC into savings (on-chain) and earmark to a goal. */
export async function contributeToGoal(input: { userId: string; goalId: string; amount: number }) {
  const amount = round7(input.amount);
  if (!(amount > 0)) throw new Error("Contribution must be positive.");

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
  const goal = await prisma.goal.findFirstOrThrow({
    where: { id: input.goalId, userId: input.userId },
  });
  const applied = round7(Math.min(amount, goal.targetAmount - goal.currentAmount));
  if (applied <= 0) throw new Error("This goal is already fully funded.");
  if (wallet.availableBalance < applied) throw new Error("Insufficient available balance.");

  // On-chain: move USDC from the user's account into the vault savings.
  const secret = await getWalletSecret(input.userId);
  const { hash } = await depositSavings(secret, wallet.publicKey, applied);

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: input.userId },
      data: {
        availableBalance: round7(wallet.availableBalance - applied),
        savingsBalance: round7(wallet.savingsBalance + applied),
      },
    });
    await tx.goal.update({
      where: { id: goal.id },
      data: {
        currentAmount: round2(goal.currentAmount + applied),
        isCompleted: goal.currentAmount + applied >= goal.targetAmount,
      },
    });
    await tx.transaction.create({
      data: {
        userId: input.userId,
        type: TRANSACTION_TYPES.goal_contribution,
        amount: applied,
        asset: "USDC",
        memo: `Contribution to ${goal.name}`,
        stellarTxId: hash,
      },
    });
  });

  return { applied, goalId: goal.id, stellarTxId: hash, explorerUrl: explorer().tx(hash) };
}

/** Withdraw savings from the vault back to the user's spendable balance. */
export async function withdrawFromSavings(input: { userId: string; amount: number }) {
  const amount = round7(input.amount);
  if (!(amount > 0)) throw new Error("Amount must be positive.");
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
  if (wallet.savingsBalance < amount) throw new Error("Insufficient savings balance.");

  const secret = await getWalletSecret(input.userId);
  const { hash } = await withdrawSavings(secret, wallet.publicKey, amount);

  await prisma.wallet.update({
    where: { userId: input.userId },
    data: {
      availableBalance: round7(wallet.availableBalance + amount),
      savingsBalance: round7(wallet.savingsBalance - amount),
    },
  });
  return { amount, stellarTxId: hash, explorerUrl: explorer().tx(hash) };
}

/** Update the auto-save rate on-chain (contract-enforced) and mirror in the DB. */
export async function updateSavingsRate(userId: string, rate: number) {
  const clamped = Math.min(0.9, Math.max(0.05, rate));
  const secret = await getWalletSecret(userId);
  await setUserRate(secret, Math.round(clamped * 10000));
  return prisma.user.update({ where: { id: userId }, data: { savingsRate: clamped } });
}

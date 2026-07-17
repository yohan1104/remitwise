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
import { allocateSavings } from "./allocation";
import { addUsdc, subUsdc, round2, round7 } from "@/lib/money";
import { audit } from "@/lib/audit";
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
  const newAvailableBalance = addUsdc(wallet.availableBalance, availableAmount);
  const newSavingsBalance = addUsdc(wallet.savingsBalance, savedAmount);

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

  await audit({ action: "remittance.received", userId, amount, txHash: onchain.hash });

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
  // Pure, unit-tested allocation math (see lib/savings/allocation.ts).
  const allocations = allocateSavings(goals, amount);
  for (const a of allocations) {
    await tx.goal.update({
      where: { id: a.id },
      data: { currentAmount: a.newCurrent, isCompleted: a.completed },
    });
  }
  return allocations.map(({ id, name, added, completed }) => ({ id, name, added, completed }));
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
        availableBalance: subUsdc(wallet.availableBalance, applied),
        savingsBalance: addUsdc(wallet.savingsBalance, applied),
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

  await audit({ action: "goal.contribute", userId: input.userId, amount: applied, txHash: hash, detail: goal.name });
  return { applied, goalId: goal.id, stellarTxId: hash, explorerUrl: explorer().tx(hash) };
}

/**
 * Claim a funded goal: withdraw its balance from the vault to the user's
 * spendable USDC (on-chain, gasless), and mark the goal claimed.
 */
export async function withdrawGoal(input: { userId: string; goalId: string }) {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
  const goal = await prisma.goal.findFirstOrThrow({
    where: { id: input.goalId, userId: input.userId },
  });
  if (goal.claimedAt) throw new Error("This goal has already been claimed.");
  const amount = round7(goal.currentAmount);
  if (!(amount > 0)) throw new Error("Nothing to withdraw from this goal yet.");
  if (wallet.savingsBalance < amount - 1e-6) {
    throw new Error("Insufficient vault balance.");
  }

  // On-chain: move USDC from the vault back to the user's account.
  const secret = await getWalletSecret(input.userId);
  const { hash } = await withdrawSavings(secret, wallet.publicKey, amount);

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: input.userId },
      data: {
        availableBalance: addUsdc(wallet.availableBalance, amount),
        savingsBalance: subUsdc(wallet.savingsBalance, amount, { floorZero: true }),
      },
    });
    await tx.goal.update({
      where: { id: goal.id },
      data: { claimedAt: new Date() },
    });
    await tx.transaction.create({
      data: {
        userId: input.userId,
        type: TRANSACTION_TYPES.withdrawal,
        amount,
        asset: "USDC",
        memo: `Withdrew ${goal.name}`,
        stellarTxId: hash,
      },
    });
  });

  await audit({ action: "goal.withdraw", userId: input.userId, amount, txHash: hash, detail: goal.name });
  return { amount, goalId: goal.id, stellarTxId: hash, explorerUrl: explorer().tx(hash) };
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
      availableBalance: addUsdc(wallet.availableBalance, amount),
      savingsBalance: subUsdc(wallet.savingsBalance, amount, { floorZero: true }),
    },
  });
  await audit({ action: "savings.withdraw", userId: input.userId, amount, txHash: hash });
  return { amount, stellarTxId: hash, explorerUrl: explorer().tx(hash) };
}

/** Update the auto-save rate on-chain (contract-enforced) and mirror in the DB. */
export async function updateSavingsRate(userId: string, rate: number) {
  const clamped = Math.min(0.9, Math.max(0.05, rate));
  const secret = await getWalletSecret(userId);
  await setUserRate(secret, Math.round(clamped * 10000));
  return prisma.user.update({ where: { id: userId }, data: { savingsRate: clamped } });
}

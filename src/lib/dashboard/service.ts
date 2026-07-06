import "server-only";
import { prisma } from "@/lib/prisma";
import { getOnChainWalletState } from "@/lib/stellar/service";
import { explorer, vaultInfo } from "@/lib/stellar/soroban";
import { getFxInfo } from "@/lib/stellar/oracle";
import { goalMeta } from "@/lib/constants";
import { clamp } from "@/lib/utils";
import type {
  DashboardData,
  FinancialHealth,
  GoalView,
  TransactionView,
  TimeSeriesPoint,
  WalletView,
} from "@/lib/types";
import { format } from "date-fns";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compose the entire dashboard payload for a user in a single read.
 * On-chain balance lookup is best-effort and time-boxed so the dashboard
 * renders instantly even when Horizon is slow.
 */
export async function getDashboardData(
  userId: string,
  opts: { includeOnChain?: boolean } = {},
): Promise<DashboardData> {
  const [wallet, goalsRaw, txRaw, user] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({ where: { userId } }),
    prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
  ]);

  const transactions: TransactionView[] = txRaw.map((t) => ({
    id: t.id,
    type: t.type as TransactionView["type"],
    amount: t.amount,
    asset: t.asset,
    sender: t.sender,
    memo: t.memo,
    savedAmount: t.savedAmount,
    availableAmount: t.availableAmount,
    status: t.status,
    stellarTxId: t.stellarTxId,
    createdAt: t.createdAt.toISOString(),
  }));

  const remittances = txRaw.filter((t) => t.type === "remittance_received");
  const totalRemittances = round2(
    remittances.reduce((s, t) => s + t.amount, 0),
  );
  const lifetimeSaved = round2(
    remittances.reduce((s, t) => s + (t.savedAmount ?? 0), 0),
  );
  const avgSavedPerRemittance =
    remittances.length > 0 ? round2(lifetimeSaved / remittances.length) : 0;
  const monthAgo = Date.now() - 30 * 86400000;
  const savedThisMonth = round2(
    remittances
      .filter((t) => t.createdAt.getTime() >= monthAgo)
      .reduce((s, t) => s + (t.savedAmount ?? 0), 0),
  );

  const goals: GoalView[] = goalsRaw.map((g) => {
    const meta = goalMeta(g.category);
    const remaining = Math.max(0, g.targetAmount - g.currentAmount);
    // ETA in remittances, based on this goal's share of the average save.
    const perRemit =
      g.allocationPct > 0
        ? avgSavedPerRemittance * (g.allocationPct / 100)
        : avgSavedPerRemittance / Math.max(1, goalsRaw.filter((x) => !x.isCompleted).length);
    const etaRemittances =
      remaining > 0 && perRemit > 0 ? Math.ceil(remaining / perRemit) : null;
    return {
      id: g.id,
      name: g.name,
      category: g.category,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      progress: g.targetAmount > 0 ? clamp(g.currentAmount / g.targetAmount) : 0,
      color: g.color || meta.color,
      isCompleted: g.isCompleted,
      claimedAt: g.claimedAt ? g.claimedAt.toISOString() : null,
      priority: (g.priority as GoalView["priority"]) ?? "medium",
      allocationPct: g.allocationPct,
      status: (g.status as GoalView["status"]) ?? "active",
      targetDate: g.targetDate ? g.targetDate.toISOString() : null,
      etaRemittances,
      createdAt: g.createdAt.toISOString(),
    };
  });

  const totals = {
    totalRemittances,
    remittanceCount: remittances.length,
    availableBalance: round2(wallet.availableBalance),
    savingsBalance: round2(wallet.savingsBalance),
    lifetimeSaved,
    avgSavedPerRemittance,
    savedThisMonth,
  };

  // --- On-chain (optional / best-effort) --------------------------------
  let onChain: WalletView["onChain"];
  if (opts.includeOnChain) {
    try {
      onChain = await getOnChainWalletState(wallet.publicKey);
    } catch {
      onChain = undefined;
    }
  }

  const info = vaultInfo();
  const links = explorer();

  // Live FX via Reflector (cached 5 min; degrades to a labelled reference rate).
  const fx = await getFxInfo().catch(() => ({
    usdPhp: 58.75,
    source: "reference" as const,
    oracleLive: false,
    oracleContractId: "",
    updatedAt: new Date().toISOString(),
  }));

  return {
    wallet: {
      publicKey: wallet.publicKey,
      network: wallet.network,
      provisioned: wallet.provisioned,
      availableBalance: round2(wallet.availableBalance),
      savingsBalance: round2(wallet.savingsBalance),
      onChain,
    },
    chain: {
      network: info.network,
      vaultContractId: info.vaultContractId,
      usdcIssuer: info.usdcIssuer,
      explorerContractUrl: links.contract(info.vaultContractId),
      explorerAccountUrl: links.account(wallet.publicKey),
    },
    fx: {
      usdPhp: fx.usdPhp,
      source: fx.source,
      oracleLive: fx.oracleLive,
      oracleContractId: fx.oracleContractId,
    },
    savingsRate: user.savingsRate,
    totals,
    financialHealth: computeFinancialHealth({
      savingsRate: user.savingsRate,
      totals,
      goals,
      remittanceCount: remittances.length,
    }),
    goals,
    transactions,
    charts: {
      savingsOverTime: buildSavingsOverTime(txRaw),
      spendVsSave: buildSpendVsSave(remittances),
      goalAllocation: goals
        .filter((g) => g.currentAmount > 0 && !g.claimedAt)
        .map((g) => ({ name: g.name, value: round2(g.currentAmount), color: g.color })),
    },
  };
}

function computeFinancialHealth(args: {
  savingsRate: number;
  totals: { savingsBalance: number; totalRemittances: number };
  goals: GoalView[];
  remittanceCount: number;
}): FinancialHealth {
  const { savingsRate, totals, goals, remittanceCount } = args;

  // 1) Savings discipline — rate relative to a healthy 20% target.
  const rateScore = clamp(savingsRate / 0.2) * 100;

  // 2) Goal progress — average completion across goals.
  const goalScore =
    goals.length > 0
      ? (goals.reduce((s, g) => s + g.progress, 0) / goals.length) * 100
      : 40;

  // 3) Emergency buffer — savings vs a 1k baseline cushion.
  const bufferScore = clamp(totals.savingsBalance / 1000) * 100;

  // 4) Consistency — rewards a track record of remittances.
  const consistencyScore = clamp(remittanceCount / 6) * 100;

  const factors = [
    { label: "Savings rate", value: Math.round(rateScore), weight: 0.3 },
    { label: "Goal progress", value: Math.round(goalScore), weight: 0.3 },
    { label: "Safety buffer", value: Math.round(bufferScore), weight: 0.25 },
    { label: "Consistency", value: Math.round(consistencyScore), weight: 0.15 },
  ];

  const score = Math.round(
    factors.reduce((s, f) => s + f.value * f.weight, 0),
  );

  const label: FinancialHealth["label"] =
    score >= 85 ? "Excellent" : score >= 65 ? "Strong" : score >= 45 ? "Steady" : "Building";

  return { score, label, factors };
}

function buildSavingsOverTime(
  txRaw: { type: string; amount: number; savedAmount: number | null; availableAmount: number | null; createdAt: Date }[],
): TimeSeriesPoint[] {
  const asc = [...txRaw].reverse();
  let savings = 0;
  let available = 0;
  let remittances = 0;
  const byDay = new Map<string, TimeSeriesPoint>();

  for (const t of asc) {
    if (t.type === "remittance_received") {
      savings += t.savedAmount ?? 0;
      available += t.availableAmount ?? 0;
      remittances += t.amount;
    } else if (t.type === "goal_contribution") {
      savings += t.amount;
      available -= t.amount;
    }
    const key = format(t.createdAt, "MMM d");
    byDay.set(key, {
      date: key,
      savings: round2(savings),
      available: round2(available),
      remittances: round2(remittances),
    });
  }

  const points = Array.from(byDay.values());
  // Seed a zero origin so the chart doesn't start mid-air.
  if (points.length > 0) {
    return [{ date: "Start", savings: 0, available: 0, remittances: 0 }, ...points];
  }
  return points;
}

function buildSpendVsSave(
  remittances: { savedAmount: number | null; availableAmount: number | null; createdAt: Date }[],
) {
  const asc = [...remittances].reverse();
  return asc.slice(-8).map((t, i) => ({
    label: format(t.createdAt, "MMM d") || `#${i + 1}`,
    saved: round2(t.savedAmount ?? 0),
    spendable: round2(t.availableAmount ?? 0),
  }));
}

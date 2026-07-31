import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, Transaction } from "@prisma/client";
import { TRANSACTION_TYPES } from "@/lib/constants";
import { vaultInfo } from "@/lib/stellar/soroban";
import { getFxInfo } from "@/lib/stellar/oracle";
import { monthKeyOf, monthLabel, monthRange } from "@/lib/export";
import { round2 } from "@/lib/money";
import type {
  StatementData,
  TransactionPage,
  TransactionView,
} from "@/lib/types";

/**
 * Activity service — full-history queries behind the dashboard's
 * always-loaded snapshot. Cursor-paginated so it scales past the
 * point where loading everything client-side stops being honest.
 */

const KNOWN_TYPES = new Set<string>(Object.values(TRANSACTION_TYPES));

export interface ListTransactionsOptions {
  cursor?: string;
  limit?: number;
  /** Filter to these transaction types (unknown values ignored). */
  types?: string[];
  from?: Date;
  to?: Date;
  /** Case-insensitive match against sender or memo. */
  q?: string;
}

function toView(t: Transaction): TransactionView {
  return {
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
  };
}

function buildWhere(
  userId: string,
  opts: ListTransactionsOptions,
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };
  const types = opts.types?.filter((t) => KNOWN_TYPES.has(t));
  if (types && types.length > 0) where.type = { in: types };
  if (opts.from || opts.to) {
    where.createdAt = {
      ...(opts.from ? { gte: opts.from } : {}),
      ...(opts.to ? { lte: opts.to } : {}),
    };
  }
  return where;
}

/**
 * Free-text search runs in application space over a bounded recent window:
 * Prisma `contains` is case-sensitive on SQLite and `mode: "insensitive"`
 * doesn't exist there, so this is the only matching that behaves the same
 * on SQLite (local) and Postgres (production). Personal remittance history
 * is small; the window keeps the worst case bounded.
 */
const SEARCH_SCAN_MAX = 2000;

function matchesQuery(t: Transaction, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    (t.sender ?? "").toLowerCase().includes(needle) ||
    (t.memo ?? "").toLowerCase().includes(needle)
  );
}

async function searchRows(
  userId: string,
  opts: ListTransactionsOptions,
  q: string,
): Promise<Transaction[]> {
  const scanned = await prisma.transaction.findMany({
    where: buildWhere(userId, opts),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: SEARCH_SCAN_MAX,
  });
  return scanned.filter((t) => matchesQuery(t, q));
}

export async function listTransactions(
  userId: string,
  opts: ListTransactionsOptions = {},
): Promise<TransactionPage> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const q = opts.q?.trim();

  if (q) {
    const matched = await searchRows(userId, opts, q);
    const start = opts.cursor
      ? matched.findIndex((t) => t.id === opts.cursor) + 1
      : 0;
    const page = matched.slice(start, start + limit);
    const hasMore = start + limit < matched.length;
    return {
      transactions: page.map(toView),
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null,
    };
  }

  const rows = await prisma.transaction.findMany({
    where: buildWhere(userId, opts),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    transactions: page.map(toView),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function countTransactions(
  userId: string,
  opts: ListTransactionsOptions = {},
): Promise<number> {
  const q = opts.q?.trim();
  if (q) return (await searchRows(userId, opts, q)).length;
  return prisma.transaction.count({ where: buildWhere(userId, opts) });
}

/** Export cap — generous for personal history, bounded for the server. */
const EXPORT_MAX_ROWS = 5000;

export async function listTransactionsForExport(
  userId: string,
  opts: Omit<ListTransactionsOptions, "cursor" | "limit"> = {},
): Promise<TransactionView[]> {
  const q = opts.q?.trim();
  if (q) return (await searchRows(userId, opts, q)).map(toView);
  const rows = await prisma.transaction.findMany({
    where: buildWhere(userId, opts),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_MAX_ROWS,
  });
  return rows.map(toView);
}

/** Months (newest first, "yyyy-MM") that have any activity — powers pickers. */
export async function listActivityMonths(userId: string): Promise<string[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    select: { createdAt: true },
  });
  const keys = new Set(rows.map((r) => monthKeyOf(r.createdAt)));
  return [...keys].sort().reverse();
}

/**
 * Monthly statement: period activity + aggregates, formatted for a
 * printable, independently verifiable proof of remittance income.
 */
export async function buildStatement(
  userId: string,
  month: string,
): Promise<StatementData> {
  const { from, to } = monthRange(month);
  const [user, wallet, rows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.wallet.findUniqueOrThrow({ where: { userId } }),
    prisma.transaction.findMany({
      where: { userId, createdAt: { gte: from, lte: to } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const remittances = rows.filter((t) => t.type === TRANSACTION_TYPES.remittance_received);
  const other = rows.filter((t) => t.type !== TRANSACTION_TYPES.remittance_received);

  const totalReceived = round2(remittances.reduce((s, t) => s + t.amount, 0));
  const totalSaved = round2(remittances.reduce((s, t) => s + (t.savedAmount ?? 0), 0));
  const totalSpendable = round2(
    remittances.reduce((s, t) => s + (t.availableAmount ?? 0), 0),
  );
  const sumOf = (type: string) =>
    round2(rows.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0));
  const cashOuts = rows.filter((t) => t.type === TRANSACTION_TYPES.cash_out);

  const fx = await getFxInfo().catch(() => ({
    usdPhp: 58.75,
    source: "reference" as const,
  }));

  return {
    month,
    label: monthLabel(month),
    generatedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email },
    wallet: { publicKey: wallet.publicKey, network: wallet.network },
    chain: { vaultContractId: vaultInfo().vaultContractId },
    fx: { usdPhp: fx.usdPhp, source: fx.source },
    summary: {
      remittanceCount: remittances.length,
      totalReceived,
      totalSaved,
      totalSpendable,
      effectiveRate: totalReceived > 0 ? totalSaved / totalReceived : 0,
      goalContributions: sumOf(TRANSACTION_TYPES.goal_contribution),
      vaultWithdrawals: sumOf(TRANSACTION_TYPES.withdrawal),
      cashOutCount: cashOuts.length,
      cashOutTotal: round2(cashOuts.reduce((s, t) => s + t.amount, 0)),
    },
    remittances: remittances.map(toView),
    other: other.map(toView),
  };
}

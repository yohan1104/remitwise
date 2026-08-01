import type { TransactionView } from "@/lib/types";
import { explorerTxUrl } from "@/lib/utils";

/**
 * Pure helpers for CSV export and statement periods.
 * No server imports — unit-tested in tests/export.test.ts.
 */

export const TX_TYPE_LABELS: Record<TransactionView["type"], string> = {
  remittance_received: "Remittance received",
  savings_allocation: "Auto-save allocation",
  goal_contribution: "Goal contribution",
  withdrawal: "Vault withdrawal",
  cash_out: "Bank cash-out",
  transfer_sent: "QR payment sent",
  transfer_received: "QR payment received",
};

/**
 * Escape a CSV cell: quote when needed and neutralize spreadsheet formula
 * injection (sender/memo are user-influenced free text).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replaceAll(`"`, `""`)}"`;
  return s;
}

/** Build a spreadsheet-ready CSV of transactions (amounts unsigned; type conveys direction). */
export function buildTransactionsCsv(
  rows: TransactionView[],
  network: string,
): string {
  const header = [
    "Date (UTC)",
    "Type",
    "Sender",
    "Reference",
    "Amount (USDC)",
    "Auto-saved (USDC)",
    "Spendable (USDC)",
    "Status",
    "Stellar Tx Hash",
    "Explorer URL",
  ];
  const lines = [header.join(",")];
  for (const t of rows) {
    lines.push(
      [
        csvCell(new Date(t.createdAt).toISOString()),
        csvCell(TX_TYPE_LABELS[t.type] ?? t.type),
        csvCell(t.sender),
        csvCell(t.memo),
        csvCell(t.amount.toFixed(2)),
        csvCell(t.savedAmount != null ? t.savedAmount.toFixed(2) : ""),
        csvCell(t.availableAmount != null ? t.availableAmount.toFixed(2) : ""),
        csvCell(t.status),
        csvCell(t.stellarTxId),
        csvCell(t.stellarTxId ? explorerTxUrl(network, t.stellarTxId) : ""),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/** Inclusive [from, to] range covering a "yyyy-MM" month in local time. */
export function monthRange(month: string): { from: Date; to: Date } {
  const m = MONTH_KEY.exec(month);
  if (!m) throw new Error(`Invalid month key: ${month}`);
  const year = Number(m[1]);
  const mon = Number(m[2]) - 1;
  const from = new Date(year, mon, 1, 0, 0, 0, 0);
  const to = new Date(year, mon + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

/** "2026-07" → "July 2026". */
export function monthLabel(month: string): string {
  const { from } = monthRange(month);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(from);
}

/** "yyyy-MM" key for a date in local time. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

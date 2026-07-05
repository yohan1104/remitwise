import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as USDC currency. */
export function formatCurrency(
  amount: number,
  opts: { compact?: boolean; sign?: boolean } = {},
): string {
  const { compact, sign } = opts;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? "compact" : "standard",
  }).format(Math.abs(amount));
  const prefix = sign ? (amount >= 0 ? "+" : "-") : amount < 0 ? "-" : "";
  return `${prefix}${formatted}`;
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

/** Truncate a Stellar public key for compact display. */
export function truncateKey(key: string, lead = 6, tail = 6): string {
  if (!key || key.length <= lead + tail) return key;
  return `${key.slice(0, lead)}…${key.slice(-tail)}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

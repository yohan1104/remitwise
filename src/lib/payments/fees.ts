/**
 * Transfer limits, fee policy and the arithmetic behind the review screen.
 * Pure — shared by the API (authoritative) and the client (live preview while
 * the payer edits the amount), so both always show the same numbers.
 */

import { addUsdc, subUsdc, round2 } from "@/lib/money";
import { PaymentError } from "./errors";

/** Smallest sendable payment — below this the network fee dominates. */
export const TRANSFER_MIN_USDC = 0.5;
/** Per-payment ceiling. Keeps a compromised session from draining a wallet. */
export const TRANSFER_MAX_USDC = 10_000;

/**
 * Fee policy: RemitWise-to-RemitWise payments are free (they settle inside the
 * platform's sponsored fee lane). Paying an external Stellar address costs a
 * flat network fee, matching the off-ramp's convention. Ops-tunable, no deploy.
 *
 * Evaluated server-side; the client renders the fee the API quoted.
 */
export const EXTERNAL_TRANSFER_FEE_USDC = (() => {
  const raw = Number(process.env.FEE_TRANSFER_NETWORK_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.1;
})();

export function transferFeeUsdc(internal: boolean): number {
  return internal ? 0 : EXTERNAL_TRANSFER_FEE_USDC;
}

export interface TransferTotals {
  amount: number;
  fee: number;
  /** What the sender is debited. */
  total: number;
  /** Available balance once the payment settles (never negative in display). */
  balanceAfter: number;
  sufficient: boolean;
}

export function computeTransferTotals(
  amount: number,
  fee: number,
  availableBalance: number,
): TransferTotals {
  const total = addUsdc(amount, fee);
  const sufficient = availableBalance + 1e-9 >= total;
  return {
    amount: round2(amount),
    fee: round2(fee),
    total: round2(total),
    balanceAfter: round2(subUsdc(availableBalance, total, { floorZero: !sufficient })),
    sufficient,
  };
}

/**
 * Parse a user-typed amount. Returns null for anything that isn't a clean
 * money value — we never coerce "12abc" or "1.2345" into a payment.
 */
export function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Range-check an amount that is about to move.
 * @throws PaymentError `amount_invalid` | `amount_too_small` | `amount_too_large`
 */
export function assertTransferAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new PaymentError("amount_invalid");
  if (amount < TRANSFER_MIN_USDC) throw new PaymentError("amount_too_small");
  if (amount > TRANSFER_MAX_USDC) throw new PaymentError("amount_too_large");
  return amount;
}

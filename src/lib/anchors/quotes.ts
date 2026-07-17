import "server-only";
import { getFxInfo } from "@/lib/stellar/oracle";
import { round2, subUsdc, pctUsdc, addUsdc } from "@/lib/money";
import { findSenderCurrency } from "./currencies";
import { findRail } from "./rails";
import type { DepositQuote, WithdrawalQuote } from "./types";

/**
 * Quote engine for both ramp directions. All arithmetic goes through the
 * integer-stroop money helpers — no float drift — and every quote carries its
 * FX source so the UI can label oracle prices vs reference rates honestly.
 *
 * Fee schedule (env-overridable so ops can tune without a deploy):
 *   Off-ramp: 0.6% service (min $0.99) + $0.10 network
 *   On-ramp:  1.2% anchor + $0.99 fixed, charged in the sender's currency
 */
const OFFRAMP_SERVICE_PCT = num(process.env.FEE_OFFRAMP_SERVICE_PCT, 0.006);
const OFFRAMP_SERVICE_MIN = num(process.env.FEE_OFFRAMP_SERVICE_MIN_USD, 0.99);
const OFFRAMP_NETWORK_FEE = num(process.env.FEE_OFFRAMP_NETWORK_USD, 0.1);
const ONRAMP_PCT = num(process.env.FEE_ONRAMP_PCT, 0.012);
const ONRAMP_FIXED_USD = num(process.env.FEE_ONRAMP_FIXED_USD, 0.99);

export const WITHDRAWAL_MIN_USDC = 5;
export const WITHDRAWAL_MAX_USDC = 50_000;
export const DEPOSIT_MIN_USD = 1;
export const DEPOSIT_MAX_USD = 50_000;

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** USDC → PHP payout quote for a specific rail. */
export async function quoteWithdrawal(
  amountUsdc: number,
  railCode: string,
): Promise<WithdrawalQuote> {
  const found = findRail(railCode);
  if (!found) throw new Error("Unsupported payout destination.");

  const serviceFeeUsdc = Math.max(OFFRAMP_SERVICE_MIN, pctUsdc(amountUsdc, OFFRAMP_SERVICE_PCT));
  const networkFeeUsdc = OFFRAMP_NETWORK_FEE;
  const feeUsdc = addUsdc(serviceFeeUsdc, networkFeeUsdc);
  const netUsdc = subUsdc(amountUsdc, feeUsdc);
  if (netUsdc <= 0) throw new Error("Amount is too small to cover fees.");

  const fx = await getFxInfo();
  return {
    amountUsdc,
    feeUsdc: round2(feeUsdc),
    serviceFeeUsdc: round2(serviceFeeUsdc),
    networkFeeUsdc: round2(networkFeeUsdc),
    fxRate: fx.usdPhp,
    fxSource: fx.source,
    fiatCurrency: found.corridor.currency,
    payoutFiat: round2(netUsdc * fx.usdPhp),
    eta: found.rail.eta,
  };
}

/** Sender fiat → USDC quote for an on-ramp deposit. */
export function quoteDeposit(amountFiat: number, fiatCurrency: string): DepositQuote {
  const currency = findSenderCurrency(fiatCurrency);
  if (!currency) throw new Error("Unsupported sender currency.");

  // Fixed fee is defined in USD; charge its equivalent in the sender currency.
  const fixedFeeFiat = currency.usdPerUnit > 0 ? ONRAMP_FIXED_USD / currency.usdPerUnit : 0;
  const feeFiat = round2(amountFiat * ONRAMP_PCT + fixedFeeFiat);
  const netFiat = amountFiat - feeFiat;
  if (netFiat <= 0) throw new Error("Amount is too small to cover fees.");

  const amountUsdc = round2(netFiat * currency.usdPerUnit);
  if (amountUsdc < DEPOSIT_MIN_USD) throw new Error("Amount is below the minimum transfer.");

  return {
    fiatCurrency: currency.code,
    amountFiat: round2(amountFiat),
    feeFiat,
    fxRate: currency.usdPerUnit,
    fxSource: "reference",
    amountUsdc,
  };
}

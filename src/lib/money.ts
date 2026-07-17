/**
 * Safe money arithmetic for USDC amounts.
 *
 * All arithmetic is performed on integer stroops (1 USDC = 10^7 stroops —
 * Stellar's native resolution) using BigInt, so sums and splits are exact and
 * deterministic. Floats exist only at the display/API boundary, produced by a
 * single well-defined conversion. The chain remains the source of truth; the
 * DB stores the mirrored decimal for fast reads.
 */

export const STROOPS_PER_USDC = 10_000_000n;

/** Convert a decimal USDC amount to integer stroops (round-half-up). */
export function toStroops(usdc: number): bigint {
  if (!Number.isFinite(usdc)) throw new Error("Invalid amount.");
  // Scale in string space to dodge float representation error (e.g. 0.1+0.2).
  const negative = usdc < 0;
  const fixed = Math.abs(usdc).toFixed(7); // clamps to stroop resolution
  const [whole, frac = ""] = fixed.split(".");
  const stroops = BigInt(whole) * STROOPS_PER_USDC + BigInt(frac.padEnd(7, "0"));
  return negative ? -stroops : stroops;
}

/** Convert integer stroops back to a decimal USDC number. */
export function fromStroops(stroops: bigint): number {
  return Number(stroops) / Number(STROOPS_PER_USDC);
}

/** Exact sum of decimal USDC amounts (via integer stroops). */
export function addUsdc(...amounts: number[]): number {
  return fromStroops(amounts.reduce((acc, a) => acc + toStroops(a), 0n));
}

/** Exact difference a − b, optionally floored at zero. */
export function subUsdc(a: number, b: number, opts?: { floorZero?: boolean }): number {
  let out = toStroops(a) - toStroops(b);
  if (opts?.floorZero && out < 0n) out = 0n;
  return fromStroops(out);
}

/** amount × rate with banker's-safe integer rounding at stroop resolution. */
export function pctUsdc(amount: number, rate: number): number {
  const bps = BigInt(Math.round(rate * 10_000));
  return fromStroops((toStroops(amount) * bps) / 10_000n);
}

/** True when two amounts are equal at stroop resolution. */
export function eqUsdc(a: number, b: number): boolean {
  return toStroops(a) === toStroops(b);
}

/** Round to cents for display/aggregate figures. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;
/** Clamp to USDC's 7-decimal resolution (kept for boundary parsing). */
export const round7 = (n: number): number => fromStroops(toStroops(n));

/**
 * Pure allocation math for the savings engine — no I/O, fully unit-tested.
 *
 * v2: plan-based distribution. Each active goal carries an `allocationPct`
 * (the user's savings plan, normally summing to 100). Every saved amount is
 * split by those percentages, capped at each goal's remaining need; overflow
 * cascades to the other unfilled goals (proportionally to their plan) until
 * everything is placed or all goals are full. Leftover stays unallocated.
 *
 * Backward compatibility: when no goal has a plan (all pct = 0), we fall back
 * to weighting by remaining need — the original engine behavior.
 */

export interface AllocatableGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  /** Percent of every saved amount this goal receives (0–100). */
  allocationPct?: number;
  /** high | medium | low — planning metadata (suggestions, ordering, badges). */
  priority?: string;
  /** active | paused | archived — only active goals receive allocations. */
  status?: string;
  claimedAt?: Date | string | null;
}

export interface Allocation {
  id: string;
  name: string;
  added: number;
  newCurrent: number;
  completed: boolean;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
/** USDC precision (7 decimals — Stellar's stroop resolution). */
export const round7 = (n: number): number => Math.round(n * 1e7) / 1e7;

const EPSILON = 0.005;

function eligible(goals: AllocatableGoal[]): AllocatableGoal[] {
  return goals.filter(
    (g) =>
      (g.status ?? "active") === "active" &&
      !g.claimedAt &&
      g.currentAmount < g.targetAmount,
  );
}

export function allocateSavings(goals: AllocatableGoal[], amount: number): Allocation[] {
  const active = eligible(goals);
  if (active.length === 0 || amount <= 0) return [];

  const totalPct = active.reduce((s, g) => s + (g.allocationPct ?? 0), 0);
  const weightOf =
    totalPct > 0
      ? (g: AllocatableGoal) => g.allocationPct ?? 0
      : (g: AllocatableGoal) => g.targetAmount - g.currentAmount; // legacy fallback

  // Waterfall: distribute the pool by weight among unfilled goals, cap at each
  // goal's remaining need, and cascade the overflow until placed or all full.
  const added = new Map<string, number>();
  const remaining = new Map(active.map((g) => [g.id, g.targetAmount - g.currentAmount]));
  let pool = amount;

  for (let pass = 0; pass < active.length + 3 && pool > EPSILON; pass++) {
    const unfilled = active.filter((g) => (remaining.get(g.id) ?? 0) > EPSILON);
    if (unfilled.length === 0) break;
    const totalWeight = unfilled.reduce((s, g) => s + weightOf(g), 0);
    if (totalWeight <= 0) break;

    const poolThisPass = pool;
    let placedThisPass = 0;
    for (const g of unfilled) {
      const ideal = Math.min(
        round2((weightOf(g) / totalWeight) * poolThisPass),
        remaining.get(g.id)!,
        pool,
      );
      if (ideal <= 0) continue;
      added.set(g.id, round2((added.get(g.id) ?? 0) + ideal));
      remaining.set(g.id, round2(remaining.get(g.id)! - ideal));
      pool = round2(pool - ideal);
      placedThisPass = round2(placedThisPass + ideal);
    }
    if (placedThisPass <= 0) break; // rounding stall — handled below
  }

  // Rounding dust: place whatever tiny remainder is left into the first goal
  // that can still take it, so nothing is ever lost.
  if (pool > 0) {
    const sink = active.find((g) => (remaining.get(g.id) ?? 0) >= pool);
    if (sink) {
      added.set(sink.id, round2((added.get(sink.id) ?? 0) + pool));
      remaining.set(sink.id, round2(remaining.get(sink.id)! - pool));
      pool = 0;
    }
  }

  return active
    .filter((g) => (added.get(g.id) ?? 0) > 0)
    .map((g) => {
      const add = added.get(g.id)!;
      const newCurrent = round2(g.currentAmount + add);
      return {
        id: g.id,
        name: g.name,
        added: add,
        newCurrent,
        completed: newCurrent >= g.targetAmount,
      };
    });
}

/**
 * Suggested allocation plan from priorities alone: High=3, Medium=2, Low=1,
 * normalized to 100 with the first goal absorbing the rounding remainder.
 */
export function suggestAllocations(
  goals: { priority?: string }[],
): number[] {
  if (goals.length === 0) return [];
  const weight = (p?: string) => (p === "high" ? 3 : p === "low" ? 1 : 2);
  const total = goals.reduce((s, g) => s + weight(g.priority), 0);
  const pcts = goals.map((g) => Math.round((weight(g.priority) / total) * 100));
  const drift = 100 - pcts.reduce((s, p) => s + p, 0);
  pcts[0] += drift;
  return pcts;
}

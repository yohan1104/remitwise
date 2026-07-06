/**
 * Pure allocation math for the savings engine — no I/O, fully unit-tested.
 * Distributes a saved amount across incomplete goals, weighted by each goal's
 * remaining need, capping at targets and absorbing rounding in the last goal.
 */

export interface AllocatableGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
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

export function allocateSavings(goals: AllocatableGoal[], amount: number): Allocation[] {
  const active = goals.filter((g) => g.currentAmount < g.targetAmount);
  if (active.length === 0 || amount <= 0) return [];

  const totalRemaining = active.reduce(
    (sum, g) => sum + (g.targetAmount - g.currentAmount),
    0,
  );

  let pool = amount;
  const out: Allocation[] = [];

  for (let i = 0; i < active.length; i++) {
    const goal = active[i];
    const remaining = goal.targetAmount - goal.currentAmount;
    // The last goal soaks up any rounding remainder so nothing is lost.
    const share =
      i === active.length - 1
        ? Math.min(pool, remaining)
        : Math.min(round2((remaining / totalRemaining) * amount), remaining, pool);

    if (share <= 0) continue;
    const newCurrent = round2(goal.currentAmount + share);
    pool = round2(pool - share);
    out.push({
      id: goal.id,
      name: goal.name,
      added: round2(share),
      newCurrent,
      completed: newCurrent >= goal.targetAmount,
    });
  }

  return out;
}

import { authed, ok, fail } from "@/lib/api";
import { onboardingSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { provisionWalletForUser } from "@/lib/stellar/service";
import { updateSavingsRate } from "@/lib/savings/engine";
import { createGoal } from "@/lib/goals/service";
import { goalMeta } from "@/lib/constants";
import { NextResponse } from "next/server";

// Provisioning + on-chain set_rate can take a while on testnet.
export const maxDuration = 60;

/**
 * Finalize guided onboarding in one call:
 *  1. ensure the wallet is provisioned on Stellar (gasless, idempotent),
 *  2. set the chosen auto-save rate on the vault contract,
 *  3. create the user's savings goals with their allocation plan,
 *  4. mark the account onboarded.
 */
export async function POST(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const parsed = onboardingSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid onboarding data.");
  }
  const { savingsRate, goals } = parsed.data;

  // Allocation plan must total 100% when goals exist.
  if (goals.length > 0) {
    const total = goals.reduce((s, g) => s + g.allocationPct, 0);
    if (Math.abs(total - 100) > 0.5) {
      return fail("Goal allocations must total exactly 100%.");
    }
  }

  try {
    // 1) Gasless wallet activation (idempotent — may already be done).
    const prov = await provisionWalletForUser(guard.id);
    if (!prov.trustline) {
      return fail("Could not activate your wallet on Stellar. Please retry.", 502);
    }

    // 2) On-chain, contract-enforced savings rate.
    await updateSavingsRate(guard.id, savingsRate);

    // 3) Goals + allocation plan.
    for (const g of goals) {
      await createGoal({
        userId: guard.id,
        name: g.name,
        category: g.category,
        targetAmount: g.targetAmount,
        color: goalMeta(g.category).color,
        priority: g.priority,
        allocationPct: g.allocationPct,
        targetDate: g.targetDate ?? null,
      });
    }

    // 4) Done — never show onboarding again.
    await prisma.user.update({ where: { id: guard.id }, data: { onboarded: true } });
    return ok({ success: true });
  } catch (err) {
    console.error("onboarding complete failed", err);
    return fail("Setup hit a network hiccup. Please retry.", 502);
  }
}

import { NextResponse } from "next/server";
import { authed, ok, fail } from "@/lib/api";
import { withdrawalCreateSchema } from "@/lib/validation";
import { createWithdrawal, listWithdrawals } from "@/lib/payouts/engine";

export const maxDuration = 60;

/** Withdrawal history (statuses refreshed from the anchor as a side effect). */
export async function GET() {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  try {
    return ok({ withdrawals: await listWithdrawals(guard.id) });
  } catch (err) {
    console.error(err);
    return fail("Could not load withdrawals.", 500);
  }
}

/** Confirm a cash-out: locks the quote, moves USDC on-chain, opens payout. */
export async function POST(req: Request) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;

  const parsed = withdrawalCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");

  try {
    const withdrawal = await createWithdrawal({ userId: guard.id, ...parsed.data });
    return ok({ withdrawal });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Withdrawal failed.", 502);
  }
}

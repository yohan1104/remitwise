import { NextResponse } from "next/server";
import { z } from "zod";
import { authed, ok, fail } from "@/lib/api";
import { quoteWithdrawal, WITHDRAWAL_MIN_USDC, WITHDRAWAL_MAX_USDC } from "@/lib/anchors/quotes";

const querySchema = z.object({
  amount: z.coerce.number().positive().max(WITHDRAWAL_MAX_USDC),
  rail: z.string().min(3).max(40),
});

/** Live payout quote (FX + fees) — an estimate until confirmation locks it. */
export async function GET(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    amount: url.searchParams.get("amount"),
    rail: url.searchParams.get("rail"),
  });
  if (!parsed.success) return fail("Invalid quote request.");
  if (parsed.data.amount < WITHDRAWAL_MIN_USDC) {
    return fail(`Minimum withdrawal is $${WITHDRAWAL_MIN_USDC} USDC.`);
  }

  try {
    const quote = await quoteWithdrawal(parsed.data.amount, parsed.data.rail);
    return ok({ quote });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not quote.", 502);
  }
}

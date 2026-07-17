import { authed, ok, fail } from "@/lib/api";
import { savingsRateSchema } from "@/lib/validation";
import { updateSavingsRate } from "@/lib/savings/engine";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function PATCH(req: Request) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;
  const parsed = savingsRateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid rate.");
  }
  const user = await updateSavingsRate(guard.id, parsed.data.rate);
  return ok({ savingsRate: user.savingsRate });
}

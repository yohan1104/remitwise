import { authed, ok, fail } from "@/lib/api";
import { contributeSchema } from "@/lib/validation";
import { withdrawFromSavings } from "@/lib/savings/engine";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const parsed = contributeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid amount.");
  try {
    const result = await withdrawFromSavings({ userId: guard.id, amount: parsed.data.amount });
    return ok({ result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Withdrawal failed.", 502);
  }
}

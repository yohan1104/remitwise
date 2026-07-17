import { authed, ok, fail } from "@/lib/api";
import { contributeSchema } from "@/lib/validation";
import { contributeToGoal } from "@/lib/savings/engine";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = contributeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid amount.");
  }
  try {
    const result = await contributeToGoal({
      userId: guard.id,
      goalId: id,
      amount: parsed.data.amount,
    });
    return ok({ result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Contribution failed.");
  }
}

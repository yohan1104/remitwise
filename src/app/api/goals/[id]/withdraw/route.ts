import { authed, ok, fail } from "@/lib/api";
import { withdrawGoal } from "@/lib/savings/engine";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    const result = await withdrawGoal({ userId: guard.id, goalId: id });
    return ok({ result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Withdrawal failed.", 502);
  }
}

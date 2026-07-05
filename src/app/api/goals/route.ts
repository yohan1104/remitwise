import { authed, ok, fail } from "@/lib/api";
import { goalSchema } from "@/lib/validation";
import { createGoal, listGoals } from "@/lib/goals/service";
import { NextResponse } from "next/server";

export async function GET() {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const goals = await listGoals(guard.id);
  return ok({ goals });
}

export async function POST(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const parsed = goalSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid goal.");
  }
  const goal = await createGoal({ userId: guard.id, ...parsed.data });
  return ok({ goal }, { status: 201 });
}

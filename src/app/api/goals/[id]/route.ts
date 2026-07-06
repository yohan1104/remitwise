import { authed, ok, fail } from "@/lib/api";
import { deleteGoal, updateGoal } from "@/lib/goals/service";
import { goalUpdateSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  await deleteGoal(guard.id, id);
  return ok({ success: true });
}

/** Edit a goal: name, target, priority, deadline, or status (pause/archive). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const parsed = goalUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid goal update.");
  }
  try {
    const goal = await updateGoal(guard.id, id, parsed.data);
    return ok({ goal });
  } catch {
    return fail("Goal not found.", 404);
  }
}

import { authed, ok } from "@/lib/api";
import { deleteGoal } from "@/lib/goals/service";
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

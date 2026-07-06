import { authed, ok, fail } from "@/lib/api";
import { allocationUpdateSchema } from "@/lib/validation";
import { updateAllocations } from "@/lib/goals/service";
import { NextResponse } from "next/server";

/** Replace the savings allocation plan. Percentages must total 100. */
export async function PUT(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const parsed = allocationUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid allocation.");
  }
  const total = parsed.data.allocations.reduce((s, a) => s + a.pct, 0);
  if (Math.abs(total - 100) > 0.5) {
    return fail("Allocations must total exactly 100%.");
  }
  await updateAllocations(guard.id, parsed.data.allocations);
  return ok({ success: true });
}

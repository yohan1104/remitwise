import { NextResponse } from "next/server";
import { authed, ok, fail } from "@/lib/api";
import { getDeposit } from "@/lib/payouts/deposits";

/** Poll a deposit intent's status (recipient view). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    return ok({ deposit: await getDeposit(guard.id, id) });
  } catch {
    return fail("Transfer not found.", 404);
  }
}

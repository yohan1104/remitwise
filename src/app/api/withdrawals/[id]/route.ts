import { NextResponse } from "next/server";
import { authed, ok, fail } from "@/lib/api";
import { getWithdrawal } from "@/lib/payouts/engine";

/** Single withdrawal with a fresh status read from the anchor. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    return ok({ withdrawal: await getWithdrawal(guard.id, id) });
  } catch {
    return fail("Withdrawal not found.", 404);
  }
}

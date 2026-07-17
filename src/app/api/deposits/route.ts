import { NextResponse } from "next/server";
import { authed, ok, fail } from "@/lib/api";
import { depositCreateSchema } from "@/lib/validation";
import { createDepositIntent, listDeposits } from "@/lib/payouts/deposits";

export const maxDuration = 60;

/** The recipient's deposit (transfer-request) history. */
export async function GET() {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  try {
    return ok({ deposits: await listDeposits(guard.id) });
  } catch (err) {
    console.error(err);
    return fail("Could not load transfers.", 500);
  }
}

/** Open an on-ramp session: lock a quote, get the anchor's interactive URL. */
export async function POST(req: Request) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;

  const parsed = depositCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");

  try {
    const deposit = await createDepositIntent({ userId: guard.id, ...parsed.data });
    return ok({ deposit });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not start the transfer.", 502);
  }
}

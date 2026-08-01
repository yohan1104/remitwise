import { NextResponse } from "next/server";
import { authed, ok } from "@/lib/api";
import { transferCreateSchema } from "@/lib/validation";
import { executeTransfer } from "@/lib/payments/transfer";
import { invalidPaymentRequest, paymentFailure } from "@/lib/payments/api";

// Settlement waits on Horizon; give it room beyond the default.
export const maxDuration = 60;

/**
 * Execute a QR payment.
 *
 * The body carries the server's own signed intent — not a recipient — so the
 * only client-controlled value is the amount (and only when the payee left it
 * open). `idempotencyKey` makes retries and double-taps safe: the same key
 * always maps to the same transfer.
 */
export async function POST(req: Request) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;

  const parsed = transferCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidPaymentRequest(parsed.error, "intent_invalid");

  try {
    const transfer = await executeTransfer({ userId: guard.id, ...parsed.data });
    return ok({ transfer });
  } catch (err) {
    return paymentFailure(err, "transfer");
  }
}

import { NextResponse } from "next/server";
import { authed, ok } from "@/lib/api";
import { qrResolveSchema } from "@/lib/validation";
import { resolveScannedPayment } from "@/lib/payments/resolve";
import { invalidPaymentRequest, paymentFailure } from "@/lib/payments/api";

export const maxDuration = 30;

/**
 * Verify a scanned QR payload and return a reviewable payment.
 *
 * Read-only: nothing is charged here. The response carries a signed intent
 * token that /api/transfers requires, so the recipient and fee shown on the
 * review screen are exactly the ones that will be executed.
 */
export async function POST(req: Request) {
  const guard = await authed("qr");
  if (guard instanceof NextResponse) return guard;

  const parsed = qrResolveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidPaymentRequest(parsed.error, "qr_unreadable");

  try {
    return ok({ preview: await resolveScannedPayment({ userId: guard.id, payload: parsed.data.payload }) });
  } catch (err) {
    return paymentFailure(err, "qr resolve");
  }
}

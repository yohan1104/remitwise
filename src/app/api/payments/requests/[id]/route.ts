import { NextResponse } from "next/server";
import { authed, ok } from "@/lib/api";
import { appOrigin } from "@/lib/app-url";
import { cancelPaymentRequest, getPaymentRequest } from "@/lib/payments/requests";
import { paymentFailure } from "@/lib/payments/api";

type Params = { params: Promise<{ id: string }> };

/** Poll a payment code so the payee sees "paid" the moment it settles. */
export async function GET(req: Request, { params }: Params) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    return ok({ request: await getPaymentRequest(guard.id, id, appOrigin(req)) });
  } catch (err) {
    return paymentFailure(err, "get payment request");
  }
}

/** Revoke an unpaid code — it stops being payable immediately. */
export async function DELETE(_req: Request, { params }: Params) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await cancelPaymentRequest(guard.id, id);
    return ok({ cancelled: true });
  } catch (err) {
    return paymentFailure(err, "cancel payment request");
  }
}

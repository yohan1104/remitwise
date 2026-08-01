import { NextResponse } from "next/server";
import { authed, ok } from "@/lib/api";
import { appOrigin } from "@/lib/app-url";
import { paymentRequestCreateSchema } from "@/lib/validation";
import { createPaymentRequest, listPaymentRequests } from "@/lib/payments/requests";
import { invalidPaymentRequest, paymentFailure } from "@/lib/payments/api";

export const maxDuration = 30;

/** The signed-in user's recent payment codes, with live status. */
export async function GET(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  try {
    return ok({ requests: await listPaymentRequests(guard.id, appOrigin(req)) });
  } catch (err) {
    return paymentFailure(err, "list payment requests");
  }
}

/** Mint a payment code others can scan to pay this user. */
export async function POST(req: Request) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;

  const parsed = paymentRequestCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidPaymentRequest(parsed.error, "amount_invalid");

  try {
    const request = await createPaymentRequest({
      userId: guard.id,
      origin: appOrigin(req),
      ...parsed.data,
    });
    return ok({ request }, { status: 201 });
  } catch (err) {
    return paymentFailure(err, "create payment request");
  }
}

import "server-only";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { isPaymentError, paymentErrorInfo, type PaymentErrorCode } from "./errors";

/**
 * Schema rejections still speak the payment vocabulary, so the client renders
 * a specific message and the right recovery button rather than falling back to
 * "something went wrong".
 */
export function invalidPaymentRequest(error: ZodError, fallback: PaymentErrorCode): NextResponse {
  const issue = error.issues[0];
  const field = issue?.path[0];
  const code: PaymentErrorCode =
    field === "amount"
      ? "amount_invalid"
      : field === "intentToken" || field === "idempotencyKey"
        ? "intent_invalid"
        : fallback;
  return NextResponse.json(
    { error: issue?.message ?? paymentErrorInfo(code).message, code },
    { status: paymentErrorInfo(code).status },
  );
}

/**
 * Turn any thrown value into the `{ error, code }` envelope the payment UI
 * understands. A typed PaymentError keeps its code; anything else is a server
 * fault and is logged rather than leaked (internal messages can contain
 * account ids, Horizon payloads and other detail users shouldn't see).
 */
export function paymentFailure(err: unknown, context: string): NextResponse {
  if (isPaymentError(err)) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  console.error(`[payments] ${context}`, err);
  const info = paymentErrorInfo("server_error");
  return NextResponse.json(
    { error: info.message, code: "server_error" satisfies PaymentErrorCode },
    { status: 500 },
  );
}

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { receiveRemittance } from "@/lib/savings/engine";
import { ok, fail } from "@/lib/api";

export const maxDuration = 60;

/**
 * Machine-to-machine remittance ingest — the production entry point called by
 * the Horizon payment listener (scripts/payment-listener.ts) or an anchor
 * webhook when USDC arrives for a user. Authenticated with a shared secret
 * (constant-time compared), never by user session.
 *
 * Idempotent: an `externalId` (e.g. the inbound Stellar tx hash) is recorded
 * and duplicate deliveries are acknowledged without re-processing.
 */
const ingestSchema = z.object({
  recipientEmail: z.string().email().optional(),
  recipientPublicKey: z.string().length(56).optional(),
  amount: z.coerce.number().positive().max(1_000_000),
  sender: z.string().max(120).optional(),
  memo: z.string().max(200).optional(),
  externalId: z.string().max(120).optional(),
});

function secretMatches(provided: string | null): boolean {
  const expected = env.paymentWebhookSecret;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("x-webhook-secret"))) {
    return fail("Unauthorized.", 401);
  }
  const parsed = ingestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid payload.");
  const { recipientEmail, recipientPublicKey, amount, sender, memo, externalId } = parsed.data;

  // Resolve the recipient by wallet address or account email.
  const wallet = recipientPublicKey
    ? await prisma.wallet.findFirst({ where: { publicKey: recipientPublicKey } })
    : recipientEmail
      ? await prisma.wallet.findFirst({ where: { user: { email: recipientEmail.toLowerCase() } } })
      : null;
  if (!wallet) return fail("Unknown recipient.", 404);

  // Idempotency: if we've already processed this external event, ack it.
  if (externalId) {
    const dupe = await prisma.transaction.findFirst({
      where: { userId: wallet.userId, memo: { contains: externalId } },
      select: { id: true },
    });
    if (dupe) return ok({ status: "already_processed", transactionId: dupe.id });
  }

  const result = await receiveRemittance({
    userId: wallet.userId,
    amount,
    sender,
    memo: externalId ? `${memo ?? "Inbound payment"} [${externalId}]` : memo,
  });
  return ok({ status: "processed", result });
}

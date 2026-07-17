import { authed, ok, fail } from "@/lib/api";
import { remittanceSchema } from "@/lib/validation";
import { receiveRemittance, WalletNotProvisionedError } from "@/lib/savings/engine";
import { DEMO_SENDERS } from "@/lib/constants";
import { NextResponse } from "next/server";

// On-chain settlement can take several seconds — give the function room on Vercel.
export const maxDuration = 60;

/**
 * Simulates an incoming USDC remittance and settles it on-chain through the
 * Soroban savings vault. In production this handler is replaced by a Horizon
 * payment-stream webhook that calls the exact same `receiveRemittance` service.
 */
export async function POST(req: Request) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;
  try {
    const parsed = remittanceSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid amount.");
    }
    const sender =
      parsed.data.sender ||
      DEMO_SENDERS[Math.floor(Math.random() * DEMO_SENDERS.length)];

    const result = await receiveRemittance({
      userId: guard.id,
      amount: parsed.data.amount,
      sender,
      memo: parsed.data.memo || "USDC remittance",
    });
    return ok({ result });
  } catch (err) {
    if (err instanceof WalletNotProvisionedError) {
      return fail("Your wallet isn't activated on Stellar yet. Activating now — please retry in a moment.", 409);
    }
    console.error(err);
    return fail("Could not settle the remittance on-chain. Please try again.", 502);
  }
}

import { authed, ok, fail } from "@/lib/api";
import { provisionWalletForUser } from "@/lib/stellar/service";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Activate the user's wallet on Stellar: Friendbot funding + USDC trustline.
 * Idempotent and safe to poll from the client.
 */
export async function POST() {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;
  try {
    const result = await provisionWalletForUser(guard.id);
    return ok(result);
  } catch (err) {
    console.error("provision error", err);
    return fail("Could not activate wallet on Stellar. Please retry.", 502);
  }
}

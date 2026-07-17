import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { settleDeposit } from "@/lib/payouts/deposits";

export const maxDuration = 60;

/**
 * Sender confirms payment on the interactive page (mock-anchor flow).
 *
 * Unauthenticated by design — the sender is not a RemitWise user; possession
 * of the unguessable intent id (cuid, shared by the recipient) is the
 * capability, mirroring how anchor-hosted SEP-24 pages work. Defense in
 * depth: per-IP rate limiting, single-use claim inside `settleDeposit`, and
 * a response that reveals nothing beyond the intent's own status.
 *
 * With a real SEP-24 anchor this endpoint is unused — the anchor's webhook /
 * status poll drives settlement instead.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await rateLimit("general");
  if (limited) return limited;

  const { id } = await params;
  const intent = await prisma.depositIntent.findUnique({ where: { id }, select: { id: true } });
  if (!intent) return fail("Transfer not found.", 404);

  try {
    const deposit = await settleDeposit(id);
    return ok({ deposit });
  } catch (err) {
    console.error("deposit settlement failed:", err);
    return fail("Settlement failed. The recipient has not been charged.", 502);
  }
}

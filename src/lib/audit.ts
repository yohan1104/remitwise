import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Append-only audit trail for financial and auth events.
 * Best-effort by design: an audit failure must never break the user's
 * transaction (the on-chain record is the authoritative trail).
 */
export type AuditAction =
  | "auth.register"
  | "auth.login"
  | "auth.login_failed"
  | "auth.password_changed"
  | "remittance.received"
  | "goal.contribute"
  | "goal.withdraw"
  | "savings.withdraw"
  | "savings.rate_changed"
  | "wallet.provisioned"
  | "withdrawal.created"
  | "withdrawal.completed"
  | "withdrawal.failed"
  | "deposit.intent_created"
  | "deposit.completed"
  | "deposit.failed"
  | "activity.export";

export async function audit(entry: {
  action: AuditAction;
  userId?: string;
  amount?: number;
  txHash?: string;
  detail?: string;
}): Promise<void> {
  try {
    let ip: string | undefined;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    } catch {
      /* not in a request context (worker/script) */
    }
    await prisma.auditLog.create({ data: { ...entry, ip } });
  } catch (err) {
    console.error("audit write failed", err);
  }
}

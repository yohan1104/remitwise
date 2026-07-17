import "server-only";
import type {
  AnchorProvider,
  DepositSession,
  WithdrawalSession,
  WithdrawalStatus,
} from "./types";
import { getStellarConfig } from "@/lib/stellar/config";

/**
 * Simulated anchor with a realistic asynchronous lifecycle.
 *
 * Stands in for a regulated SEP-24 partner (MoneyGram Access, Vibrant, a PH
 * anchor) until credentials exist. Two deliberate design points:
 *
 * 1. **Stateless progression.** Withdrawal statuses are a pure function of
 *    elapsed time since creation, so status survives server restarts and needs
 *    no background worker — exactly how polling a real anchor behaves, where
 *    the anchor owns the state and we only observe it.
 *
 * 2. **Same settlement topology as production.** Withdrawn USDC really moves
 *    on-chain to a settlement account (the treasury doubles as the mock
 *    anchor's account), and deposits settle through the same ingest path a
 *    real anchor's payment would.
 */

// Elapsed-time thresholds (ms) for the withdrawal lifecycle.
const CONVERTING_AT = 8_000;
const PAYING_OUT_AT = 18_000;
const COMPLETED_AT = 32_000;

export class MockAnchor implements AnchorProvider {
  readonly name = "mock-anchor";

  async initiateDeposit(input: {
    destinationPublicKey: string;
    amountFiat: number;
    fiatCurrency: string;
    reference: string;
  }): Promise<DepositSession> {
    // The interactive page is our own /pay/<intent> route — it plays the role
    // of the anchor-hosted checkout where the sender completes a bank payment.
    return {
      id: `mock-dep-${input.reference}`,
      interactiveUrl: `/pay/${input.reference}`,
      status: "awaiting_payment",
    };
  }

  async getDepositStatus(id: string): Promise<DepositSession> {
    // Deposits are driven by the sender's explicit action on the interactive
    // page (see /api/deposits/[id]/pay), not by elapsed time — the DB row is
    // authoritative. This method exists for interface completeness.
    return { id, interactiveUrl: "", status: "awaiting_payment" };
  }

  async initiateWithdrawal(input: { reference: string }): Promise<WithdrawalSession> {
    const cfg = getStellarConfig();
    return {
      id: `mock-wd-${input.reference}`,
      status: "pending_anchor",
      // The treasury acts as the mock anchor's Stellar settlement account.
      settlementAddress: cfg.distributor.publicKey,
      settlementMemo: input.reference.slice(0, 28), // Stellar text memo limit
    };
  }

  async getWithdrawalStatus(id: string, createdAt: Date): Promise<WithdrawalSession> {
    const cfg = getStellarConfig();
    const elapsed = Date.now() - createdAt.getTime();
    const status: WithdrawalStatus =
      elapsed >= COMPLETED_AT
        ? "completed"
        : elapsed >= PAYING_OUT_AT
          ? "paying_out"
          : elapsed >= CONVERTING_AT
            ? "converting"
            : "pending_anchor";
    return {
      id,
      status,
      settlementAddress: cfg.distributor.publicKey,
      settlementMemo: "",
    };
  }
}

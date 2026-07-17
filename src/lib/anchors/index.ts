import "server-only";

/**
 * Fiat on/off-ramp abstraction (Stellar SEP-24 shape).
 *
 * Production connects a regulated anchor partner (MoneyGram Access, Vibrant,
 * a regional PH/GCC anchor) so a sender pays plain fiat by bank/card and the
 * anchor mints USDC on Stellar — landing in the same ingest pipeline as every
 * other remittance. This interface is the seam: swapping the mock for a real
 * SEP-24 client requires no changes anywhere else in the app.
 */

export interface DepositSession {
  id: string;
  /** Anchor-hosted interactive page where the sender completes payment/KYC. */
  interactiveUrl: string;
  status: "incomplete" | "pending_user" | "pending_anchor" | "completed" | "error";
}

export interface AnchorProvider {
  readonly name: string;
  /** Start a fiat→USDC deposit for a recipient's Stellar address. */
  initiateDeposit(input: {
    destinationPublicKey: string;
    amount?: number;
    fiatCurrency: string; // e.g. "USD", "AED", "SGD"
  }): Promise<DepositSession>;
  getDepositStatus(id: string): Promise<DepositSession>;
}

/** Placeholder used until an anchor partnership supplies real credentials. */
export class MockAnchor implements AnchorProvider {
  readonly name = "mock-anchor";
  private sessions = new Map<string, DepositSession>();

  async initiateDeposit({ destinationPublicKey }: { destinationPublicKey: string }) {
    const id = `mock-${Date.now()}-${destinationPublicKey.slice(0, 4)}`;
    const session: DepositSession = {
      id,
      interactiveUrl: `https://anchor.example/deposit/${id}`,
      status: "pending_user",
    };
    this.sessions.set(id, session);
    return session;
  }

  async getDepositStatus(id: string) {
    return (
      this.sessions.get(id) ?? { id, interactiveUrl: "", status: "error" as const }
    );
  }
}

export const anchor: AnchorProvider = new MockAnchor();

/**
 * Provider-agnostic anchor contracts (Stellar SEP-24 shape).
 *
 * An "anchor" is the regulated bridge between fiat rails and Stellar: on the
 * way in it accepts a sender's bank money and delivers USDC; on the way out it
 * accepts USDC and pays a local bank account. RemitWise talks to anchors only
 * through these interfaces, so adding a corridor or switching partners is
 * configuration, not a refactor.
 *
 * Status values mirror the SEP-24 lifecycle but use readable names; the
 * mapping to raw SEP-24 statuses lives with each provider implementation.
 */

// ---------------------------------------------------------------------------
// Deposits (fiat → USDC, the sender side)
// ---------------------------------------------------------------------------

export type DepositStatus =
  | "awaiting_payment" // SEP-24: incomplete / pending_user_transfer_start
  | "processing" //        SEP-24: pending_anchor / pending_stellar
  | "completed"
  | "expired"
  | "failed";

export interface DepositQuote {
  fiatCurrency: string;
  amountFiat: number;
  /** Anchor fee, in the sender's currency. */
  feeFiat: number;
  /** USD per 1 unit of sender currency at quote time. */
  fxRate: number;
  /** "reflector" when read from the on-chain oracle, else a labelled reference. */
  fxSource: "reflector" | "reference";
  /** USDC the recipient receives after fees + conversion. */
  amountUsdc: number;
}

export interface DepositSession {
  /** Anchor's transaction reference. */
  id: string;
  /** Anchor-hosted interactive page where the sender completes payment/KYC. */
  interactiveUrl: string;
  status: DepositStatus;
  /** Stellar tx hash of the USDC settlement, once minted. */
  stellarTxId?: string;
}

// ---------------------------------------------------------------------------
// Withdrawals (USDC → fiat, the recipient side)
// ---------------------------------------------------------------------------

export type WithdrawalStatus =
  | "pending_anchor" // anchor has been notified, waiting for USDC to arrive
  | "converting" //     anchor converting USDC → local fiat
  | "paying_out" //     local rails transfer in flight
  | "completed"
  | "failed";

export interface WithdrawalQuote {
  amountUsdc: number;
  /** Total fees in USDC (service + network), already itemized. */
  feeUsdc: number;
  serviceFeeUsdc: number;
  networkFeeUsdc: number;
  /** Local currency per 1 USD at quote time. */
  fxRate: number;
  fxSource: "reflector" | "reference";
  fiatCurrency: string;
  /** What the destination account receives. */
  payoutFiat: number;
  /** Human ETA, e.g. "Under 30 minutes". */
  eta: string;
}

export interface WithdrawalSession {
  id: string;
  status: WithdrawalStatus;
  /**
   * Where the user's USDC must be sent to fund the payout — the anchor's
   * Stellar settlement account and the memo that ties the payment to this
   * withdrawal.
   */
  settlementAddress: string;
  settlementMemo: string;
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface AnchorProvider {
  readonly name: string;

  /** Start a fiat→USDC deposit toward a recipient's Stellar address. */
  initiateDeposit(input: {
    destinationPublicKey: string;
    amountFiat: number;
    fiatCurrency: string;
    /** Local reference (our DepositIntent id) for interactive-url callbacks. */
    reference: string;
  }): Promise<DepositSession>;

  getDepositStatus(id: string): Promise<DepositSession>;

  /** Register a USDC→fiat withdrawal and learn where to send the USDC. */
  initiateWithdrawal(input: {
    amountUsdc: number;
    fiatCurrency: string;
    railCode: string;
    accountName: string;
    accountNumber: string;
    /** Local reference (our Withdrawal id). */
    reference: string;
  }): Promise<WithdrawalSession>;

  getWithdrawalStatus(id: string, createdAt: Date): Promise<WithdrawalSession>;
}

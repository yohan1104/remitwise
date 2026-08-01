// Pure, serializable types shared between server services and client components.

export interface WalletView {
  publicKey: string;
  network: string;
  provisioned: boolean;
  availableBalance: number;
  savingsBalance: number;
  onChain?: {
    funded: boolean;
    hasTrustline: boolean;
    availableUsdc: number;
    xlm: number;
  };
}

export interface FxView {
  /** PHP per 1 USD. */
  usdPhp: number;
  source: "reflector" | "reference";
  oracleLive: boolean;
  oracleContractId: string;
}

export interface ChainInfo {
  network: string;
  vaultContractId: string;
  usdcIssuer: string;
  explorerContractUrl: string;
  explorerAccountUrl: string;
}

export interface TransactionView {
  id: string;
  type:
    | "remittance_received"
    | "savings_allocation"
    | "goal_contribution"
    | "withdrawal"
    | "cash_out";
  amount: number;
  asset: string;
  sender: string | null;
  memo: string | null;
  savedAmount: number | null;
  availableAmount: number | null;
  status: string;
  stellarTxId: string | null;
  createdAt: string;
}

export type GoalPriority = "high" | "medium" | "low";
export type GoalStatus = "active" | "paused" | "archived";

export interface GoalView {
  id: string;
  name: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  progress: number; // 0..1
  color: string;
  isCompleted: boolean;
  claimedAt: string | null;
  priority: GoalPriority;
  allocationPct: number;
  status: GoalStatus;
  targetDate: string | null;
  /** Estimated remittances until fully funded (null when unknowable). */
  etaRemittances: number | null;
  createdAt: string;
}

export interface FinancialHealth {
  score: number; // 0..100
  label: "Building" | "Steady" | "Strong" | "Excellent";
  factors: { label: string; value: number; weight: number }[];
}

export interface TimeSeriesPoint {
  date: string;
  savings: number;
  available: number;
  remittances: number;
}

export interface SpendVsSavePoint {
  label: string;
  saved: number;
  spendable: number;
}

export interface GoalAllocationSlice {
  name: string;
  value: number;
  color: string;
}

export interface DashboardData {
  wallet: WalletView;
  chain: ChainInfo;
  fx: FxView;
  savingsRate: number;
  totals: {
    totalRemittances: number;
    remittanceCount: number;
    availableBalance: number;
    savingsBalance: number;
    lifetimeSaved: number;
    /** Average saved per remittance — powers goal ETAs and projections. */
    avgSavedPerRemittance: number;
    /** Saved in the last 30 days. */
    savedThisMonth: number;
  };
  financialHealth: FinancialHealth;
  goals: GoalView[];
  transactions: TransactionView[];
  charts: {
    savingsOverTime: TimeSeriesPoint[];
    spendVsSave: SpendVsSavePoint[];
    goalAllocation: GoalAllocationSlice[];
  };
}

// ---------------------------------------------------------------------------
// Fiat ramps
// ---------------------------------------------------------------------------

export type WithdrawalStatusView =
  | "pending_anchor"
  | "converting"
  | "paying_out"
  | "completed"
  | "failed";

export interface WithdrawalView {
  id: string;
  amountUsdc: number;
  feeUsdc: number;
  fxRate: number;
  fxSource: "reflector" | "reference";
  payoutPhp: number;
  fiatCurrency: string;
  railCode: string;
  railName: string;
  /** Masked — full account numbers never leave the server. */
  accountMasked: string;
  accountName: string;
  status: WithdrawalStatusView;
  stellarTxId: string | null;
  failureReason: string | null;
  eta: string;
  createdAt: string;
  completedAt: string | null;
}

export type DepositStatusView =
  | "awaiting_payment"
  | "processing"
  | "completed"
  | "expired"
  | "failed";

export interface DepositIntentView {
  id: string;
  amountFiat: number;
  fiatCurrency: string;
  feeFiat: number;
  fxRate: number;
  amountUsdc: number;
  senderName: string | null;
  status: DepositStatusView;
  /** Anchor-hosted page where the sender completes payment. */
  interactiveUrl: string | null;
  stellarTxId: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Activity & statements
// ---------------------------------------------------------------------------

export interface TransactionPage {
  transactions: TransactionView[];
  /** Pass back as ?cursor= to fetch the next page; null when exhausted. */
  nextCursor: string | null;
}

export interface StatementSummary {
  remittanceCount: number;
  totalReceived: number;
  totalSaved: number;
  totalSpendable: number;
  /** totalSaved / totalReceived for the period (0 when no remittances). */
  effectiveRate: number;
  goalContributions: number;
  vaultWithdrawals: number;
  cashOutCount: number;
  cashOutTotal: number;
}

export interface StatementData {
  /** Period key, e.g. "2026-07". */
  month: string;
  /** Human label, e.g. "July 2026". */
  label: string;
  generatedAt: string;
  user: { name: string; email: string };
  wallet: { publicKey: string; network: string };
  chain: { vaultContractId: string };
  fx: { usdPhp: number; source: "reflector" | "reference" };
  summary: StatementSummary;
  /** Remittances received in the period (ascending by date). */
  remittances: TransactionView[];
  /** All other activity in the period (ascending by date). */
  other: TransactionView[];
}

export interface AiInsight {
  id: string;
  kind: "savings" | "goal" | "spending" | "advice" | "forecast";
  title: string;
  body: string;
  emphasis?: string;
  /** Optional one-tap action so guidance is actionable, not just informational. */
  action?: {
    label: string;
    kind: "raise_rate" | "create_emergency" | "none";
    value?: number;
  };
}

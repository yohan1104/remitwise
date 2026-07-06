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
  type: "remittance_received" | "savings_allocation" | "goal_contribution" | "withdrawal";
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

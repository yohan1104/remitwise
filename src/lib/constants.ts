import {
  ShieldCheck,
  GraduationCap,
  HeartPulse,
  Home,
  Briefcase,
  Plane,
  Target,
  type LucideIcon,
} from "lucide-react";

export type GoalCategory =
  | "emergency"
  | "education"
  | "medical"
  | "housing"
  | "business"
  | "vacation"
  | "custom";

export interface GoalCategoryMeta {
  value: GoalCategory;
  label: string;
  icon: LucideIcon;
  color: string;
  suggestedTarget: number;
  blurb: string;
}

export const GOAL_CATEGORIES: GoalCategoryMeta[] = [
  {
    value: "emergency",
    label: "Emergency Fund",
    icon: ShieldCheck,
    color: "#2563eb",
    suggestedTarget: 2000,
    blurb: "3–6 months of expenses for peace of mind.",
  },
  {
    value: "education",
    label: "Education",
    icon: GraduationCap,
    color: "#7c3aed",
    suggestedTarget: 3000,
    blurb: "Tuition, courses, and skills that pay off.",
  },
  {
    value: "medical",
    label: "Medical",
    icon: HeartPulse,
    color: "#e11d48",
    suggestedTarget: 1500,
    blurb: "Health costs covered before they hit.",
  },
  {
    value: "housing",
    label: "Housing",
    icon: Home,
    color: "#0891b2",
    suggestedTarget: 5000,
    blurb: "Rent buffer or a down-payment on a home.",
  },
  {
    value: "business",
    label: "Business",
    icon: Briefcase,
    color: "#059669",
    suggestedTarget: 4000,
    blurb: "Seed your side-hustle or grow a venture.",
  },
  {
    value: "vacation",
    label: "Vacation",
    icon: Plane,
    color: "#d97706",
    suggestedTarget: 1200,
    blurb: "A well-earned trip, fully funded.",
  },
  {
    value: "custom",
    label: "Custom Goal",
    icon: Target,
    color: "#4f46e5",
    suggestedTarget: 1000,
    blurb: "Anything else you're saving toward.",
  },
];

export function goalMeta(category: string): GoalCategoryMeta {
  return (
    GOAL_CATEGORIES.find((c) => c.value === category) ??
    GOAL_CATEGORIES[GOAL_CATEGORIES.length - 1]
  );
}

export const TRANSACTION_TYPES = {
  remittance_received: "remittance_received",
  savings_allocation: "savings_allocation",
  goal_contribution: "goal_contribution",
  withdrawal: "withdrawal",
  /** USDC left the platform to a bank / e-wallet via the fiat off-ramp. */
  cash_out: "cash_out",
  /** Person-to-person payment sent from spendable balance (QR / address). */
  transfer_sent: "transfer_sent",
  /** Person-to-person payment received into spendable balance. */
  transfer_received: "transfer_received",
} as const;

/** Default auto-savings rate applied to new users. */
export const DEFAULT_SAVINGS_RATE = 0.2;

/** Preset remittance amounts for the "Simulate Remittance" demo control. */
export const DEMO_SENDERS = [
  "Maria Santos",
  "Global Freelance Co.",
  "Juan Dela Cruz",
  "Upwork Payments",
  "Ahmed Al-Rashid",
  "Grace Mensah",
];

export const USDC_ASSET_CODE = "USDC";

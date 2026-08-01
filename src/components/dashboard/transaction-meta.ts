import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  PiggyBank,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { TransactionView } from "@/lib/types";

/** Shared icon/color/label per transaction type (list rows + detail views). */
export const TX_META: Record<
  TransactionView["type"],
  { icon: LucideIcon; color: string; label: string }
> = {
  remittance_received: { icon: ArrowDownLeft, color: "#2563eb", label: "Remittance" },
  goal_contribution: { icon: Target, color: "#059669", label: "Goal contribution" },
  savings_allocation: { icon: PiggyBank, color: "#7c3aed", label: "Savings" },
  withdrawal: { icon: ArrowUpRight, color: "#7c3aed", label: "Vault withdrawal" },
  cash_out: { icon: Landmark, color: "#d97706", label: "Bank cash-out" },
};

export function txTitle(t: TransactionView): string {
  return t.sender ?? TX_META[t.type].label;
}

/** Sign relative to spendable money: remittances add, cash-outs remove. */
export function txSign(t: TransactionView): "+" | "−" | "" {
  if (t.type === "remittance_received") return "+";
  if (t.type === "cash_out") return "−";
  return "";
}

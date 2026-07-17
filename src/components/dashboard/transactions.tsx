"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  PiggyBank,
  Target,
  Inbox,
  ExternalLink,
  Landmark,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useDashboard } from "./dashboard-context";
import type { TransactionView } from "@/lib/types";

const META: Record<
  TransactionView["type"],
  { icon: typeof ArrowDownLeft; color: string; label: string }
> = {
  remittance_received: { icon: ArrowDownLeft, color: "#2563eb", label: "Remittance" },
  goal_contribution: { icon: Target, color: "#059669", label: "Goal contribution" },
  savings_allocation: { icon: PiggyBank, color: "#7c3aed", label: "Savings" },
  withdrawal: { icon: ArrowDownLeft, color: "#e11d48", label: "Withdrawal" },
  cash_out: { icon: Landmark, color: "#d97706", label: "Bank cash-out" },
};

export function TransactionsList() {
  const { data } = useDashboard();
  const txns = data.transactions.slice(0, 10);
  const explorerTx = (hash: string) =>
    `https://stellar.expert/explorer/${data.chain.network}/tx/${hash}`;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>Every payment, tracked in real time</CardDescription>
      </CardHeader>
      <CardContent>
        {txns.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
              <Inbox className="size-5" />
            </div>
            <div>
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm text-muted-foreground">
                Simulate a remittance to see the savings engine in action.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            <AnimatePresence initial={false}>
              {txns.map((t, i) => {
                const meta = META[t.type];
                const Icon = meta.icon;
                const isRemit = t.type === "remittance_received";
                return (
                  <motion.li
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 6) * 0.03 }}
                    className="flex items-center gap-3 py-3"
                  >
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {t.sender ?? meta.label}
                        </span>
                        {isRemit && t.savedAmount != null && (
                          <Badge variant="success" className="hidden sm:inline-flex">
                            +{formatCurrency(t.savedAmount)} saved
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <span className="truncate">
                          {meta.label}
                          {t.memo ? ` · ${t.memo}` : ""} ·{" "}
                          {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                        </span>
                        {t.stellarTxId && (
                          <a
                            href={explorerTx(t.stellarTxId)}
                            target="_blank"
                            rel="noreferrer"
                            title="View transaction on Stellar"
                            className="shrink-0 text-muted-foreground/60 transition-colors hover:text-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums text-foreground">
                        {isRemit ? "+" : t.type === "cash_out" ? "−" : ""}
                        {formatCurrency(t.amount)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t.status === "pending" ? (
                          <span className="text-warning">pending</span>
                        ) : t.status === "failed" ? (
                          <span className="text-destructive">failed</span>
                        ) : (
                          t.asset
                        )}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

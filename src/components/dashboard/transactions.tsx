"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ExternalLink, Inbox } from "lucide-react";
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
import { TX_META, txSign, txTitle } from "./transaction-meta";
import { TransactionDetailDialog } from "./transaction-detail";

export function TransactionsList() {
  const { data } = useDashboard();
  const txns = data.transactions.slice(0, 10);
  const [selected, setSelected] = React.useState<TransactionView | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Every payment, tracked in real time</CardDescription>
        </div>
        <Link
          href="/dashboard/activity"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          View all <ArrowRight className="size-3.5" />
        </Link>
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
                const meta = TX_META[t.type];
                const Icon = meta.icon;
                const isRemit = t.type === "remittance_received";
                return (
                  <motion.li
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 6) * 0.03 }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(t);
                        setDetailOpen(true);
                      }}
                      aria-label={`View details of ${txTitle(t)}`}
                      className="-mx-1 flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-secondary/50"
                    >
                      <span
                        className="grid size-10 shrink-0 place-items-center rounded-full"
                        style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                      >
                        <Icon className="size-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium">{txTitle(t)}</span>
                          {isRemit && t.savedAmount != null && (
                            <Badge variant="success" className="hidden sm:inline-flex">
                              +{formatCurrency(t.savedAmount)} saved
                            </Badge>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <span className="truncate">
                            {meta.label}
                            {t.memo ? ` · ${t.memo}` : ""} ·{" "}
                            {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                          </span>
                          {t.stellarTxId && (
                            <ExternalLink
                              aria-hidden
                              className="size-3 shrink-0 text-muted-foreground/60"
                            />
                          )}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums text-foreground">
                          {txSign(t)}
                          {formatCurrency(t.amount)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {t.status === "pending" ? (
                            <span className="text-warning">pending</span>
                          ) : t.status === "failed" ? (
                            <span className="text-destructive">failed</span>
                          ) : (
                            t.asset
                          )}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>

      <TransactionDetailDialog
        tx={selected}
        network={data.chain.network}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </Card>
  );
}

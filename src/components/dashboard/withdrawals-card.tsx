"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Landmark, Loader2, ExternalLink, ArrowUpRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useDashboard } from "./dashboard-context";
import type { WithdrawalView } from "@/lib/types";

const STATUS_META: Record<
  WithdrawalView["status"],
  { label: string; variant: "success" | "warning" | "destructive" | "outline"; live?: boolean }
> = {
  pending_anchor: { label: "Sending", variant: "warning", live: true },
  converting: { label: "Converting", variant: "warning", live: true },
  paying_out: { label: "Paying out", variant: "warning", live: true },
  completed: { label: "Delivered", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

const php = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Cash-out history with live status. Polls only while something is in
 * flight, so idle dashboards make zero extra requests.
 */
export function WithdrawalsCard() {
  const { data } = useDashboard();
  const [withdrawals, setWithdrawals] = React.useState<WithdrawalView[] | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/withdrawals");
      if (!res.ok) return;
      const json = await res.json();
      setWithdrawals(json.withdrawals as WithdrawalView[]);
    } catch {
      /* keep last known state; next poll retries */
    }
  }, []);

  React.useEffect(() => {
    void load();
    const onCreated = () => void load();
    window.addEventListener("remitwise:withdrawal-created", onCreated);
    return () => window.removeEventListener("remitwise:withdrawal-created", onCreated);
  }, [load]);

  const hasActive = (withdrawals ?? []).some((w) => STATUS_META[w.status]?.live);
  React.useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [hasActive, load]);

  if (withdrawals !== null && withdrawals.length === 0) return null;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="size-4 text-primary" /> Cash-outs
        </CardTitle>
        <CardDescription>USDC → PHP payouts to your bank</CardDescription>
      </CardHeader>
      <CardContent>
        {withdrawals === null ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            <AnimatePresence initial={false}>
              {withdrawals.slice(0, 5).map((w) => {
                const meta = STATUS_META[w.status] ?? STATUS_META.pending_anchor;
                return (
                  <motion.li
                    key={w.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 py-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      {meta.live ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {w.railName} {w.accountMasked}
                        </span>
                        <Badge variant={meta.variant} className="shrink-0 px-1.5 py-0 text-[10px]">
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">
                          {w.status === "failed"
                            ? w.failureReason ?? "Failed — balance not debited"
                            : `${formatCurrency(w.amountUsdc)} · ${formatDistanceToNow(new Date(w.createdAt), { addSuffix: true })}`}
                        </span>
                        {w.stellarTxId && (
                          <a
                            href={`https://stellar.expert/explorer/${data.chain.network}/tx/${w.stellarTxId}`}
                            target="_blank"
                            rel="noreferrer"
                            title="View settlement on Stellar"
                            className="shrink-0 text-muted-foreground/60 transition-colors hover:text-primary"
                          >
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums">
                      {w.status === "failed" ? (
                        <span className="text-muted-foreground line-through">{php(w.payoutPhp)}</span>
                      ) : (
                        php(w.payoutPhp)
                      )}
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

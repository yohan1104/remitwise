"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Landmark,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Clock,
  XCircle,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatFiat } from "@/lib/anchors/currencies";
import type { DepositIntentView } from "@/lib/types";

type SenderDeposit = DepositIntentView & { recipientFirstName: string };

const SETTLE_STEPS = [
  "Confirming your bank payment",
  "Converting to USDC at the locked rate",
  "Settling on the Stellar network",
];

export function SenderCheckout({
  initial,
  network,
}: {
  initial: SenderDeposit;
  network: string;
}) {
  const [deposit, setDeposit] = React.useState<SenderDeposit>(initial);
  const [paying, setPaying] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  async function pay() {
    setPaying(true);
    setError(null);
    setStep(0);
    const ticker = setInterval(
      () => setStep((s) => Math.min(s + 1, SETTLE_STEPS.length - 1)),
      2200,
    );
    try {
      const res = await fetch(`/api/deposits/${deposit.id}/pay`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Payment failed.");
      setDeposit((d) => ({ ...d, ...(json.deposit as DepositIntentView) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      clearInterval(ticker);
      setPaying(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-4 flex items-center justify-between">
        <Logo size={28} />
        <Badge variant="outline" className="gap-1 text-xs">
          <ShieldCheck className="size-3" /> Anchor checkout · Stellar testnet
        </Badge>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <AnimatePresence mode="wait">
            {deposit.status === "completed" ? (
              <CompletedView key="done" deposit={deposit} network={network} />
            ) : deposit.status === "expired" || deposit.status === "failed" ? (
              <motion.div
                key="bad"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3 py-4 text-center"
              >
                <XCircle className="mx-auto size-10 text-destructive" />
                <h1 className="text-lg font-semibold">
                  {deposit.status === "expired" ? "This transfer link expired" : "Transfer failed"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {deposit.failureReason ??
                    "Ask the recipient to create a new transfer request from their RemitWise dashboard."}
                </p>
              </motion.div>
            ) : paying || deposit.status === "processing" ? (
              <motion.div
                key="paying"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 py-2"
              >
                <div className="text-center">
                  <div className="mx-auto grid size-14 place-items-center rounded-full brand-gradient text-primary-foreground animate-pulse-ring">
                    <Landmark className="size-6" />
                  </div>
                  <h1 className="mt-3 text-lg font-semibold">Processing your payment</h1>
                  <p className="text-sm text-muted-foreground">
                    {formatFiat(deposit.amountFiat, deposit.fiatCurrency)} →{" "}
                    {deposit.amountUsdc.toFixed(2)} USDC
                  </p>
                </div>
                <div className="space-y-3">
                  {SETTLE_STEPS.map((label, i) => (
                    <div key={label} className="flex items-center gap-3">
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-full ${
                          i < step
                            ? "bg-success/15 text-success"
                            : i === step
                              ? "bg-primary/15 text-primary"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {i < step ? (
                          <CheckCircle2 className="size-4" />
                        ) : i === step ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Clock className="size-4" />
                        )}
                      </span>
                      <span
                        className={`text-sm ${i <= step ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                <div>
                  <h1 className="text-lg font-semibold">
                    Send money to {deposit.recipientFirstName}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Pay from your bank — the conversion to digital dollars happens
                    automatically.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">You pay</div>
                      <div className="text-2xl font-bold tabular-nums">
                        {formatFiat(deposit.amountFiat, deposit.fiatCurrency)}
                      </div>
                    </div>
                    <ArrowRight className="mb-1 size-4 text-muted-foreground" />
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {deposit.recipientFirstName} receives
                      </div>
                      <div className="text-2xl font-bold tabular-nums text-primary">
                        ${deposit.amountUsdc.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">USDC on Stellar</div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Transfer fee</span>
                      <span className="tabular-nums">
                        {formatFiat(deposit.feeFiat, deposit.fiatCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rate</span>
                      <span className="tabular-nums">
                        1 {deposit.fiatCurrency} ≈ ${deposit.fxRate.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
                    {error}
                  </div>
                )}

                <Button className="w-full" size="lg" onClick={pay} disabled={paying}>
                  <Landmark className="size-4" /> Pay by bank transfer
                </Button>
                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  Simulated anchor checkout on Stellar testnet — in production this page is
                  hosted by a licensed SEP-24 anchor partner that debits your real bank
                  account. No real money moves here.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}

function CompletedView({ deposit, network }: { deposit: SenderDeposit; network: string }) {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-4 py-2 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 14 }}
        className="mx-auto grid size-16 place-items-center rounded-full bg-success/15 text-success"
      >
        <CheckCircle2 className="size-9" />
      </motion.div>
      <div>
        <h1 className="text-lg font-semibold">Transfer delivered 🎉</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatFiat(deposit.amountFiat, deposit.fiatCurrency)} arrived as{" "}
          <span className="font-medium text-foreground">${deposit.amountUsdc.toFixed(2)} USDC</span>{" "}
          in {deposit.recipientFirstName}&apos;s RemitWise wallet — part of it saved
          automatically toward their goals.
        </p>
      </div>
      {deposit.stellarTxId && (
        <a
          href={`https://stellar.expert/explorer/${network}/tx/${deposit.stellarTxId}`}
          target="_blank"
          rel="noreferrer"
          className="mx-auto flex w-fit items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <ExternalLink className="size-3.5" /> settled on Stellar ·{" "}
          {deposit.stellarTxId.slice(0, 8)}…
        </a>
      )}
    </motion.div>
  );
}

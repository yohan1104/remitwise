"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Zap, ArrowDownLeft, PiggyBank, CheckCircle2, Send, ExternalLink, Radio, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency, formatPercent, truncateKey } from "@/lib/utils";
import { DEMO_SENDERS } from "@/lib/constants";
import { useDashboard } from "./dashboard-context";
import type { RemittanceResult } from "@/lib/savings/engine";

const PRESETS = [100, 250, 500, 1000];

const STEPS = [
  { icon: Radio, label: "Broadcasting payment on Stellar" },
  { icon: Lock, label: "Soroban vault enforcing the savings split" },
  { icon: CheckCircle2, label: "Confirmed on-chain" },
];

export function SimulateRemittanceButton({
  variant = "default",
  className,
}: {
  variant?: "default" | "outline";
  className?: string;
}) {
  const { data, refresh } = useDashboard();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(500);
  const [sender, setSender] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [result, setResult] = React.useState<RemittanceResult | null>(null);

  const notProvisioned = !data.wallet.provisioned;

  function reset() {
    setResult(null);
    setBusy(false);
    setStep(0);
    setAmount(500);
    setSender("");
  }

  async function send() {
    if (!(amount > 0)) return toast.error("Enter an amount.");
    setBusy(true);
    setStep(0);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    try {
      const res = await fetch("/api/remittances/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, sender: sender || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      clearInterval(ticker);
      setStep(STEPS.length - 1);
      setResult(json.result as RemittanceResult);
      await refresh();
    } catch (err) {
      clearInterval(ticker);
      toast.error(err instanceof Error ? err.message : "Failed.");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} className={className}>
          <Zap className="size-4" /> Simulate Remittance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md overflow-hidden">
        <AnimatePresence mode="wait">
          {result ? (
            <SuccessView key="success" result={result} onDone={() => setOpen(false)} />
          ) : busy ? (
            <SettlingView key="settling" step={step} amount={amount} />
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send className="size-4 text-primary" /> Incoming USDC remittance
                </DialogTitle>
                <DialogDescription>
                  A real payment on Stellar. The Soroban vault auto-saves{" "}
                  {formatPercent(data.savingsRate)} on-chain.
                </DialogDescription>
              </DialogHeader>

              {notProvisioned && (
                <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                  Activate your wallet on the Stellar Wallet card first, then simulate a remittance.
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmount(p)}
                    className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                      amount === p
                        ? "border-primary bg-primary/8 text-primary ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    ${p}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sim-amount">Amount (USDC)</Label>
                  <Input
                    id="sim-amount"
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sim-sender">Sender (optional)</Label>
                  <Input
                    id="sim-sender"
                    placeholder={DEMO_SENDERS[0]}
                    value={sender}
                    onChange={(e) => setSender(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auto-saved ({formatPercent(data.savingsRate)})</span>
                  <span className="font-semibold text-success">{formatCurrency(amount * data.savingsRate)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Available to spend</span>
                  <span className="font-semibold">{formatCurrency(amount * (1 - data.savingsRate))}</span>
                </div>
              </div>

              <Button className="w-full" size="lg" onClick={send} disabled={notProvisioned}>
                <Zap className="size-4" /> Receive {formatCurrency(amount)}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function SettlingView({ step, amount }: { step: number; amount: number }) {
  return (
    <motion.div
      key="settling"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6 py-2"
    >
      <DialogHeader className="items-center text-center">
        <div className="relative mx-auto grid size-16 place-items-center rounded-full brand-gradient text-primary-foreground animate-pulse-ring">
          <Zap className="size-7" />
        </div>
        <DialogTitle className="mt-2">Settling {formatCurrency(amount)} on Stellar</DialogTitle>
        <DialogDescription>Real testnet transaction in progress…</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          const Icon = s.icon;
          return (
            <div key={i} className="flex items-center gap-3">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors ${
                  done
                    ? "bg-success/15 text-success"
                    : active
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {active ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
              </span>
              <span className={`text-sm ${done || active ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function SuccessView({ result, onDone }: { result: RemittanceResult; onDone: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 text-center">
      <DialogHeader className="items-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className="mx-auto grid size-16 place-items-center rounded-full bg-success/15 text-success"
        >
          <CheckCircle2 className="size-9" />
        </motion.div>
        <DialogTitle className="mt-2">Settled on-chain!</DialogTitle>
        <DialogDescription>
          {formatCurrency(result.amount)} received — split enforced by the Soroban vault.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-success/30 bg-success/8 p-4"
        >
          <PiggyBank className="mx-auto size-5 text-success" />
          <div className="mt-2 text-xs text-muted-foreground">Auto-saved</div>
          <div className="text-lg font-bold text-success">{formatCurrency(result.savedAmount)}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl border border-primary/30 bg-primary/8 p-4"
        >
          <ArrowDownLeft className="mx-auto size-5 text-primary" />
          <div className="mt-2 text-xs text-muted-foreground">Available</div>
          <div className="text-lg font-bold text-primary">{formatCurrency(result.availableAmount)}</div>
        </motion.div>
      </div>

      {result.goalsUpdated.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="rounded-xl bg-secondary/40 p-3 text-left text-sm"
        >
          <p className="mb-1.5 font-medium">Goals advanced</p>
          <ul className="space-y-1">
            {result.goalsUpdated.map((g) => (
              <li key={g.id} className="flex justify-between text-muted-foreground">
                <span>{g.name}{g.completed ? " 🎉" : ""}</span>
                <span className="font-medium text-success">+{formatCurrency(g.added)}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      <a
        href={result.explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <ExternalLink className="size-3.5" /> tx {truncateKey(result.stellarTxId, 8, 8)} · view on Stellar
      </a>

      <Button className="w-full" onClick={onDone}>
        View my dashboard
      </Button>
    </motion.div>
  );
}

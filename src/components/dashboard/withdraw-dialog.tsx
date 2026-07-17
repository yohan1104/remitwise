"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Landmark,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ExternalLink,
  Wallet,
  Smartphone,
  Clock,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, truncateKey } from "@/lib/utils";
import { PH_CORRIDOR, normalizeAccountNumber } from "@/lib/anchors/rails";
import { useDashboard } from "./dashboard-context";
import type { WithdrawalView } from "@/lib/types";

interface Quote {
  amountUsdc: number;
  feeUsdc: number;
  serviceFeeUsdc: number;
  networkFeeUsdc: number;
  fxRate: number;
  fxSource: "reflector" | "reference";
  fiatCurrency: string;
  payoutFiat: number;
  eta: string;
}

const php = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Step = "form" | "review" | "tracking";

const TRACK_STAGES: { key: WithdrawalView["status"]; label: string }[] = [
  { key: "pending_anchor", label: "USDC sent to the payout partner" },
  { key: "converting", label: "Converting USDC → PHP at the locked rate" },
  { key: "paying_out", label: "Paying out to your bank" },
  { key: "completed", label: "Delivered" },
];

// Instant e-wallets first, then banks; default to the most-used rail (GCash)
// so the common case is two fields and a review.
const SORTED_RAILS = [...PH_CORRIDOR.rails].sort((a, b) =>
  a.kind === b.kind ? 0 : a.kind === "ewallet" ? -1 : 1,
);

export function WithdrawDialog({ className }: { className?: string }) {
  const { data, refresh } = useDashboard();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("form");

  // Form state
  const [amount, setAmount] = React.useState("");
  const [railCode, setRailCode] = React.useState(SORTED_RAILS[0].code);
  const [accountName, setAccountName] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");

  // Server state
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [withdrawal, setWithdrawal] = React.useState<WithdrawalView | null>(null);

  const available = data.wallet.availableBalance;
  const amountNum = Number(amount);
  const rail = PH_CORRIDOR.rails.find((r) => r.code === railCode);
  const rails = SORTED_RAILS;

  function reset() {
    setStep("form");
    setAmount("");
    setRailCode(SORTED_RAILS[0].code);
    setAccountName("");
    setAccountNumber("");
    setQuote(null);
    setWithdrawal(null);
    setBusy(false);
  }

  const formValid =
    amountNum >= 5 &&
    amountNum <= available &&
    rail !== undefined &&
    accountName.trim().length >= 2 &&
    rail.accountPattern.test(normalizeAccountNumber(accountNumber));

  async function toReview() {
    if (!formValid || !rail) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/withdrawals/quote?amount=${encodeURIComponent(amountNum)}&rail=${encodeURIComponent(rail.code)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not fetch a quote.");
      setQuote(json.quote as Quote);
      setStep("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fetch a quote.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!rail) return;
    setBusy(true);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsdc: amountNum,
          railCode: rail.code,
          accountName: accountName.trim(),
          accountNumber: normalizeAccountNumber(accountNumber),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Withdrawal failed.");
      setWithdrawal(json.withdrawal as WithdrawalView);
      setStep("tracking");
      await refresh();
      // Tell the history card to pick up the new row immediately.
      window.dispatchEvent(new CustomEvent("remitwise:withdrawal-created"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Withdrawal failed.");
    } finally {
      setBusy(false);
    }
  }

  // Poll while tracking until the withdrawal reaches a terminal state.
  React.useEffect(() => {
    if (step !== "tracking" || !withdrawal) return;
    if (withdrawal.status === "completed" || withdrawal.status === "failed") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/withdrawals/${withdrawal.id}`);
        if (!res.ok) return;
        const json = await res.json();
        const fresh = json.withdrawal as WithdrawalView;
        setWithdrawal(fresh);
        if (fresh.status === "completed") {
          toast.success(`${php(fresh.payoutPhp)} delivered to ${fresh.railName}`);
          window.dispatchEvent(new CustomEvent("remitwise:withdrawal-created"));
        }
      } catch {
        /* transient poll failure — next tick retries */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [step, withdrawal]);

  const disabled = !data.wallet.provisioned || available < 5;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(reset, 250);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default" className={className} disabled={disabled}>
          <Landmark className="size-4" /> Withdraw to bank
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md overflow-hidden">
        <AnimatePresence mode="wait">
          {step === "form" && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Landmark className="size-4 text-primary" /> Withdraw to a Philippine bank
                </DialogTitle>
                <DialogDescription>
                  Your USDC is converted to pesos and paid out through our anchor partner.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wd-amount">Amount (USDC)</Label>
                  <button
                    type="button"
                    onClick={() => setAmount(String(Math.floor(available * 100) / 100))}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Max {formatCurrency(available)}
                  </button>
                </div>
                <Input
                  id="wd-amount"
                  type="number"
                  min={5}
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {amountNum > available && (
                  <p className="text-xs text-destructive">
                    You have {formatCurrency(available)} available.
                  </p>
                )}
                {amount !== "" && amountNum < 5 && (
                  <p className="text-xs text-muted-foreground">Minimum withdrawal is $5.00.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Bank or e-wallet</Label>
                <Select value={railCode} onValueChange={setRailCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose where to receive pesos" />
                  </SelectTrigger>
                  <SelectContent>
                    {rails.map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        <span className="flex items-center gap-2">
                          {r.kind === "ewallet" ? (
                            <Smartphone className="size-3.5 text-primary" />
                          ) : (
                            <Landmark className="size-3.5 text-muted-foreground" />
                          )}
                          {r.name}
                          <span className="text-xs text-muted-foreground">· {r.eta}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wd-name">Account holder name</Label>
                  <Input
                    id="wd-name"
                    placeholder="Juan Dela Cruz"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wd-number">
                    {rail?.kind === "ewallet" ? "Mobile number" : "Account number"}
                  </Label>
                  <Input
                    id="wd-number"
                    inputMode="numeric"
                    placeholder={rail?.kind === "ewallet" ? "09xx xxx xxxx" : "Account number"}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                  {rail && <p className="text-[11px] text-muted-foreground">{rail.accountHint}</p>}
                </div>
              </div>

              {amountNum >= 5 && amountNum <= available && (
                <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimated payout</span>
                    <span className="font-semibold">≈ {php(amountNum * data.fx.usdPhp)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Before fees · final rate locked at confirmation
                  </p>
                </div>
              )}

              <Button className="w-full" size="lg" onClick={toReview} disabled={!formValid || busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Review withdrawal
              </Button>
            </motion.div>
          )}

          {step === "review" && quote && rail && (
            <motion.div key="review" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Confirm your withdrawal</DialogTitle>
                <DialogDescription>
                  Review the locked quote — this is exactly what arrives.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {accountName.trim()} receives
                </div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-primary">
                  {php(quote.payoutFiat)}
                </div>
                <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3" /> {quote.eta}
                </div>
              </div>

              <div className="space-y-2 rounded-xl bg-secondary/40 p-3.5 text-sm">
                <Row label="You withdraw" value={formatCurrency(quote.amountUsdc)} />
                <Row label="Service fee" value={`−${formatCurrency(quote.serviceFeeUsdc)}`} />
                <Row label="Network fee" value={`−${formatCurrency(quote.networkFeeUsdc)}`} />
                <Row
                  label="Exchange rate"
                  value={
                    <span className="flex items-center gap-1.5">
                      $1 = ₱{quote.fxRate.toFixed(2)}
                      <Badge variant={quote.fxSource === "reflector" ? "success" : "outline"} className="px-1.5 py-0 text-[10px]">
                        {quote.fxSource === "reflector" ? "live oracle" : "reference"}
                      </Badge>
                    </span>
                  }
                />
                <div className="border-t border-border/70 pt-2">
                  <Row
                    label="Destination"
                    value={`${rail.name} · ${maskInput(accountNumber)}`}
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-success/8 px-3.5 py-2.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                <span>
                  Your USDC moves on Stellar to the payout partner and is converted at the
                  rate above. You&apos;ll see live status until the money lands.
                </span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("form")} disabled={busy}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button className="flex-1" size="lg" onClick={confirm} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Landmark className="size-4" />}
                  Withdraw {formatCurrency(quote.amountUsdc)}
                </Button>
              </div>
            </motion.div>
          )}

          {step === "tracking" && withdrawal && (
            <motion.div key="tracking" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              <DialogHeader className="items-center text-center">
                {withdrawal.status === "completed" ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 220, damping: 14 }}
                    className="mx-auto grid size-14 place-items-center rounded-full bg-success/15 text-success"
                  >
                    <CheckCircle2 className="size-8" />
                  </motion.div>
                ) : withdrawal.status === "failed" ? (
                  <div className="mx-auto grid size-14 place-items-center rounded-full bg-destructive/15 text-destructive">
                    <XCircle className="size-8" />
                  </div>
                ) : (
                  <div className="mx-auto grid size-14 place-items-center rounded-full brand-gradient text-primary-foreground animate-pulse-ring">
                    <Wallet className="size-6" />
                  </div>
                )}
                <DialogTitle className="mt-2">
                  {withdrawal.status === "completed"
                    ? "Money delivered!"
                    : withdrawal.status === "failed"
                      ? "Withdrawal failed"
                      : `Sending ${php(withdrawal.payoutPhp)}`}
                </DialogTitle>
                <DialogDescription>
                  {withdrawal.status === "failed"
                    ? withdrawal.failureReason ?? "Your balance was not debited."
                    : `${withdrawal.railName} · ${withdrawal.accountMasked}`}
                </DialogDescription>
              </DialogHeader>

              {withdrawal.status !== "failed" && (
                <div className="space-y-3">
                  {TRACK_STAGES.map((s, i) => {
                    const currentIdx = TRACK_STAGES.findIndex((x) => x.key === withdrawal.status);
                    const done = i < currentIdx || withdrawal.status === "completed";
                    const active = i === currentIdx && withdrawal.status !== "completed";
                    return (
                      <div key={s.key} className="flex items-center gap-3">
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors ${
                            done
                              ? "bg-success/15 text-success"
                              : active
                                ? "bg-primary/15 text-primary"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="size-4" />
                          ) : active ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Clock className="size-4" />
                          )}
                        </span>
                        <span className={`text-sm ${done || active ? "text-foreground" : "text-muted-foreground"}`}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {withdrawal.stellarTxId && (
                <a
                  href={`https://stellar.expert/explorer/${data.chain.network}/tx/${withdrawal.stellarTxId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" /> tx {truncateKey(withdrawal.stellarTxId, 8, 8)} · view on Stellar
                </a>
              )}

              <Button
                className="w-full"
                variant={withdrawal.status === "completed" ? "default" : "outline"}
                onClick={() => setOpen(false)}
              >
                {withdrawal.status === "completed" || withdrawal.status === "failed"
                  ? "Done"
                  : "Track in the background"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function maskInput(n: string) {
  const clean = normalizeAccountNumber(n);
  return clean.length <= 4 ? clean : `•••• ${clean.slice(-4)}`;
}

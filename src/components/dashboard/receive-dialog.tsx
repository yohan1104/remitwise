"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Loader2,
  Copy,
  Check,
  CheckCircle2,
  ExternalLink,
  Landmark,
  RadioTower,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
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
import { SENDER_CURRENCIES, formatFiat } from "@/lib/anchors/currencies";
import { formatCurrency, truncateKey } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";
import type { DepositIntentView } from "@/lib/types";

/**
 * "Receive from abroad" — the recipient opens an on-ramp session and shares
 * the anchor checkout link with their sender. The sender pays plain fiat from
 * their bank; USDC settles into the wallet through the savings engine, and
 * this dialog tracks it live end-to-end.
 */
export function ReceiveMoneyDialog({
  variant = "outline",
  className,
}: {
  variant?: "default" | "outline";
  className?: string;
}) {
  const { data, refresh } = useDashboard();
  const [open, setOpen] = React.useState(false);
  const [currency, setCurrency] = React.useState("USD");
  const [amount, setAmount] = React.useState("300");
  const [senderName, setSenderName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [deposit, setDeposit] = React.useState<DepositIntentView | null>(null);
  const [copied, setCopied] = React.useState(false);

  const cur = SENDER_CURRENCIES.find((c) => c.code === currency)!;
  const amountNum = Number(amount);
  const estimateUsdc = amountNum > 0 ? Math.max(0, (amountNum - amountNum * 0.012 - 0.99 / cur.usdPerUnit) * cur.usdPerUnit) : 0;

  function reset() {
    setDeposit(null);
    setBusy(false);
    setCopied(false);
  }

  async function create() {
    if (!(amountNum > 0)) return toast.error("Enter an amount.");
    setBusy(true);
    try {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountFiat: amountNum,
          fiatCurrency: currency,
          senderName: senderName.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start the transfer.");
      setDeposit(json.deposit as DepositIntentView);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the transfer.");
    } finally {
      setBusy(false);
    }
  }

  // Live-track the intent while the sender pays.
  React.useEffect(() => {
    if (!open || !deposit) return;
    if (deposit.status === "completed" || deposit.status === "failed" || deposit.status === "expired") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/deposits/${deposit.id}`);
        if (!res.ok) return;
        const json = await res.json();
        const fresh = json.deposit as DepositIntentView;
        setDeposit(fresh);
        if (fresh.status === "completed") {
          toast.success(`${formatCurrency(fresh.amountUsdc)} arrived — savings split applied on-chain`);
          await refresh();
        }
      } catch {
        /* next tick retries */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [open, deposit, refresh]);

  const payUrl =
    deposit?.interactiveUrl && typeof window !== "undefined"
      ? new URL(deposit.interactiveUrl, window.location.origin).toString()
      : "";

  async function copy() {
    await navigator.clipboard.writeText(payUrl);
    setCopied(true);
    toast.success("Payment link copied — send it to your sender");
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(reset, 250);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} className={className} disabled={!data.wallet.provisioned}>
          <Globe className="size-4" /> Receive from abroad
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md overflow-hidden">
        <AnimatePresence mode="wait">
          {deposit && deposit.status === "completed" ? (
            <motion.div key="done" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 text-center">
              <DialogHeader className="items-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 14 }}
                  className="mx-auto grid size-16 place-items-center rounded-full bg-success/15 text-success"
                >
                  <CheckCircle2 className="size-9" />
                </motion.div>
                <DialogTitle className="mt-2">Transfer arrived!</DialogTitle>
                <DialogDescription>
                  {formatFiat(deposit.amountFiat, deposit.fiatCurrency)} from{" "}
                  {deposit.senderName ?? "your sender"} settled as{" "}
                  {formatCurrency(deposit.amountUsdc)} — auto-savings applied on-chain.
                </DialogDescription>
              </DialogHeader>
              {deposit.stellarTxId && (
                <a
                  href={`https://stellar.expert/explorer/${data.chain.network}/tx/${deposit.stellarTxId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mx-auto flex w-fit items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" /> tx {truncateKey(deposit.stellarTxId, 8, 8)}
                </a>
              )}
              <Button className="w-full" onClick={() => setOpen(false)}>
                View my dashboard
              </Button>
            </motion.div>
          ) : deposit ? (
            <motion.div key="share" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <RadioTower className="size-4 text-primary" /> Waiting for your sender
                </DialogTitle>
                <DialogDescription>
                  Share this secure checkout link. They pay{" "}
                  {formatFiat(deposit.amountFiat, deposit.fiatCurrency)} from their bank — you
                  receive {formatCurrency(deposit.amountUsdc)}.
                </DialogDescription>
              </DialogHeader>

              <div className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-sm ring-1 ring-border">
                <QRCodeSVG value={payUrl} size={132} bgColor="#ffffff" fgColor="#0f2557" level="M" />
              </div>

              <button
                onClick={copy}
                className="group flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-left transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Payment link
                  </div>
                  <div className="truncate font-mono text-xs">{payUrl}</div>
                </div>
                {copied ? (
                  <Check className="size-4 shrink-0 text-success" />
                ) : (
                  <Copy className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                )}
              </button>

              <div className="flex items-center justify-between rounded-xl bg-secondary/40 p-3 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  {deposit.status === "processing" ? "Settling on Stellar…" : "Waiting for payment…"}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  auto-detects
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button asChild variant="outline" className="flex-1">
                  <a href={payUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" /> Open checkout
                  </a>
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Globe className="size-4 text-primary" /> Receive money from abroad
                </DialogTitle>
                <DialogDescription>
                  Your sender pays from their bank in their currency — no crypto knowledge
                  needed on either side.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Sender&apos;s currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SENDER_CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{c.code}</span>
                            <span className="text-xs text-muted-foreground">
                              {c.name} · {c.region}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rc-amount">They send ({currency})</Label>
                  <Input
                    id="rc-amount"
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rc-sender">Sender&apos;s name (optional)</Label>
                <Input
                  id="rc-sender"
                  placeholder="Maria Santos"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />
              </div>

              {amountNum > 0 && (
                <div className="rounded-xl bg-secondary/40 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You&apos;ll receive about</span>
                    <span className="font-semibold text-primary">
                      {formatCurrency(estimateUsdc)} USDC
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>Incl. anchor fee · exact quote locked next</span>
                    <span className="tabular-nums">
                      1 {currency} ≈ ${cur.usdPerUnit.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}

              <Button className="w-full" size="lg" onClick={create} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Landmark className="size-4" />}
                Create transfer request
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

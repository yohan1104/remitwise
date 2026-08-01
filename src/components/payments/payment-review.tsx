"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Globe,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, initials, truncateKey } from "@/lib/utils";
import {
  computeTransferTotals,
  parseAmountInput,
  TRANSFER_MAX_USDC,
  TRANSFER_MIN_USDC,
} from "@/lib/payments/fees";
import type { QrPaymentPreview } from "@/lib/types";

/**
 * The last screen before money moves.
 *
 * Every number the user is agreeing to is on it — who is paid, how much, the
 * fee, the total debit, and what their balance will be afterwards — and the
 * confirm button stays disabled until the amount is valid and affordable.
 */
export function PaymentReview({
  preview,
  amount,
  onAmountChange,
  note,
  onNoteChange,
  onConfirm,
  onBack,
  submitting,
}: {
  preview: QrPaymentPreview;
  amount: string;
  onAmountChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const amountInputRef = React.useRef<HTMLInputElement | null>(null);
  const parsed = preview.amountEditable ? parseAmountInput(amount) : preview.amount;
  const totals =
    parsed === null
      ? null
      : computeTransferTotals(parsed, preview.feeUsdc, preview.availableBalance);

  const belowMinimum = parsed !== null && parsed < TRANSFER_MIN_USDC;
  const aboveMaximum = parsed !== null && parsed > TRANSFER_MAX_USDC;
  const canConfirm =
    !submitting && totals !== null && totals.sufficient && !belowMinimum && !aboveMaximum;

  // Open-amount codes land straight in the amount field.
  React.useEffect(() => {
    if (preview.amountEditable) amountInputRef.current?.focus();
  }, [preview.amountEditable]);

  const [expiresIn, setExpiresIn] = React.useState(() => secondsUntil(preview.intentExpiresAt));
  React.useEffect(() => {
    const timer = setInterval(() => setExpiresIn(secondsUntil(preview.intentExpiresAt)), 1000);
    return () => clearInterval(timer);
  }, [preview.intentExpiresAt]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -14 }}
      className="space-y-4"
    >
      {/* Who gets paid */}
      <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full brand-gradient text-sm font-semibold text-primary-foreground">
          {initials(preview.recipient.name) || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{preview.recipient.name}</span>
            {preview.recipient.isRemitWiseUser ? (
              <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="RemitWise account" />
            ) : (
              <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-label="External Stellar wallet" />
            )}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {preview.recipient.handle ?? truncateKey(preview.recipient.address, 8, 8)}
          </div>
        </div>
        <Badge variant={preview.recipient.isRemitWiseUser ? "success" : "outline"} className="shrink-0 text-[10px]">
          {preview.recipient.isRemitWiseUser ? "RemitWise" : "Stellar"}
        </Badge>
      </div>

      {/* Amount */}
      {preview.amountEditable ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="qr-amount">Amount ({preview.asset})</Label>
            <button
              type="button"
              onClick={() =>
                onAmountChange(
                  String(
                    Math.max(
                      0,
                      Math.floor((preview.availableBalance - preview.feeUsdc) * 100) / 100,
                    ),
                  ),
                )
              }
              className="text-xs font-medium text-primary hover:underline"
            >
              Send max {formatCurrency(Math.max(0, preview.availableBalance - preview.feeUsdc))}
            </button>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
              $
            </span>
            <Input
              id="qr-amount"
              ref={amountInputRef}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              aria-describedby="qr-amount-help"
              aria-invalid={amount !== "" && parsed === null}
              className="h-14 pl-8 text-2xl font-semibold tabular-nums"
            />
          </div>
          <p id="qr-amount-help" className="text-xs text-muted-foreground">
            {amount !== "" && parsed === null ? (
              <span className="text-destructive">Enter a valid amount, e.g. 25.50.</span>
            ) : belowMinimum ? (
              <span className="text-destructive">
                Minimum payment is {formatCurrency(TRANSFER_MIN_USDC)}.
              </span>
            ) : aboveMaximum ? (
              <span className="text-destructive">
                Maximum payment is {formatCurrency(TRANSFER_MAX_USDC)}.
              </span>
            ) : totals && !totals.sufficient ? (
              <span className="text-destructive">
                That&apos;s more than your {formatCurrency(preview.availableBalance)} available
                balance.
              </span>
            ) : (
              `This code didn't set an amount — you decide. Available ${formatCurrency(preview.availableBalance)}.`
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-secondary/40 p-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <Lock className="size-3" /> Requested amount
          </div>
          <div className="mt-1 text-4xl font-bold tabular-nums text-primary">
            {formatCurrency(preview.amount ?? 0)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{preview.asset}</div>
        </div>
      )}

      {/* Breakdown */}
      <div className="space-y-2 rounded-xl bg-secondary/40 p-3.5 text-sm">
        <Row label="Amount" value={totals ? formatCurrency(totals.amount) : "—"} />
        <Row
          label="Transfer fee"
          value={
            preview.feeUsdc > 0 ? (
              formatCurrency(preview.feeUsdc)
            ) : (
              <span className="text-success">Free</span>
            )
          }
          hint={
            preview.feeUsdc > 0
              ? "Network fee for paying an external Stellar wallet"
              : "RemitWise-to-RemitWise payments are free"
          }
        />
        <div className="border-t border-border/70 pt-2">
          <Row
            label="Total deducted"
            value={<span className="font-semibold">{totals ? formatCurrency(totals.total) : "—"}</span>}
          />
          <Row
            label="Balance after transfer"
            value={
              <span className={totals && !totals.sufficient ? "text-destructive" : undefined}>
                {totals ? formatCurrency(totals.balanceAfter) : formatCurrency(preview.availableBalance)}
              </span>
            }
          />
        </div>
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <Label htmlFor="qr-note">Note (optional)</Label>
        <Input
          id="qr-note"
          maxLength={80}
          placeholder={preview.note ? preview.note : "What's this for?"}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
        />
        {preview.note && !note && (
          <p className="text-xs text-muted-foreground">
            The recipient asked for: <span className="text-foreground">{preview.note}</span>
          </p>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-success/8 px-3.5 py-2.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
        <span>
          This code was verified as genuine. Your USDC moves on Stellar the moment you
          confirm — payments can&apos;t be reversed, so check the name above.
        </span>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button className="flex-1" size="lg" onClick={onConfirm} disabled={!canConfirm}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {submitting
            ? "Sending…"
            : `Confirm & send ${totals ? formatCurrency(totals.total) : ""}`}
        </Button>
      </div>

      {expiresIn !== null && expiresIn < 60 && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {expiresIn > 0
            ? `These details refresh in ${expiresIn}s — confirm or scan again.`
            : "These details have expired — scan the code again."}
        </p>
      )}
    </motion.div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground/70">{hint}</span>}
      </span>
      <span className="shrink-0 font-medium tabular-nums">{value}</span>
    </div>
  );
}

function secondsUntil(iso: string): number | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 1000));
}

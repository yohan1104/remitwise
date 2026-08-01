"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, CheckCircle2, Copy, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime, truncateKey } from "@/lib/utils";
import type { TransferView } from "@/lib/types";

/** Receipt for a settled QR payment, with on-chain proof. */
export function PaymentSuccess({
  transfer,
  onSendAnother,
  onDone,
}: {
  transfer: TransferView;
  onSendAnother: () => void;
  onDone: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copyHash() {
    if (!transfer.stellarTxId) return;
    await navigator.clipboard.writeText(transfer.stellarTxId);
    setCopied(true);
    toast.success("Transaction hash copied");
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-4 text-center"
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
        <h3 className="text-lg font-semibold tracking-tight">Payment sent</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatCurrency(transfer.amount)} to{" "}
          <span className="font-medium text-foreground">{transfer.recipient.name}</span>
        </p>
      </div>

      <div className="space-y-2 rounded-xl bg-secondary/40 p-3.5 text-left text-sm">
        <Row label="Sent" value={formatCurrency(transfer.amount)} />
        {transfer.feeUsdc > 0 && <Row label="Fee" value={formatCurrency(transfer.feeUsdc)} />}
        <Row label="Total deducted" value={formatCurrency(transfer.totalUsdc)} />
        <Row label="New available balance" value={formatCurrency(transfer.balanceAfter)} />
        {transfer.note && <Row label="Note" value={transfer.note} />}
        <div className="border-t border-border/70 pt-2">
          <Row
            label="To"
            value={transfer.recipient.handle ?? truncateKey(transfer.recipient.address, 6, 6)}
          />
          <Row label="Date" value={formatDateTime(transfer.completedAt ?? transfer.createdAt)} />
        </div>
      </div>

      {transfer.stellarTxId && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyHash}
            className="group flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {copied ? (
              <Check className="size-3.5 shrink-0 text-success" />
            ) : (
              <Copy className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{truncateKey(transfer.stellarTxId, 8, 8)}</span>
          </button>
          {transfer.explorerUrl && (
            <Button asChild variant="outline">
              <a href={transfer.explorerUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Explorer
              </a>
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onSendAnother}>
          <Send className="size-4" /> Send another
        </Button>
        <Button className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

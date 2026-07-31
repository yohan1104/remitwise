"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  explorerTxUrl,
  formatCurrency,
  formatDateTime,
  formatPercent,
} from "@/lib/utils";
import type { TransactionView } from "@/lib/types";
import { TX_META, txSign, txTitle } from "./transaction-meta";

function statusBadge(status: string) {
  if (status === "pending") return <Badge variant="warning">Pending</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="success">Completed</Badge>;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">{children}</span>
    </div>
  );
}

function CopyHash({ hash }: { hash: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      toast.success("Transaction hash copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy — select the hash manually.");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy full transaction hash"
      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-secondary px-2 py-1 font-mono text-xs text-secondary-foreground transition-colors hover:bg-secondary/70"
    >
      <span className="truncate">{`${hash.slice(0, 10)}…${hash.slice(-10)}`}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-success" />
      ) : (
        <Copy className="size-3.5 shrink-0 opacity-60" />
      )}
    </button>
  );
}

/**
 * Full accounting of a single transaction: the split, the metadata, and the
 * on-chain proof. Controlled dialog so list rows can share one instance.
 */
export function TransactionDetailDialog({
  tx,
  network,
  open,
  onOpenChange,
}: {
  tx: TransactionView | null;
  network: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!tx) return null;
  const meta = TX_META[tx.type];
  const Icon = meta.icon;
  const isRemit = tx.type === "remittance_received";
  const savedPct = isRemit && tx.savedAmount != null && tx.amount > 0
    ? tx.savedAmount / tx.amount
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate">{txTitle(tx)}</DialogTitle>
              <DialogDescription>{meta.label}</DialogDescription>
            </div>
            <div className="ml-auto">{statusBadge(tx.status)}</div>
          </div>
        </DialogHeader>

        <div className="text-center">
          <div className="text-3xl font-bold tabular-nums tracking-tight">
            {txSign(tx)}
            {formatCurrency(tx.amount)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {tx.asset} · {formatDateTime(tx.createdAt)}
          </div>
        </div>

        {isRemit && tx.savedAmount != null && tx.availableAmount != null && (
          <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Auto-save split</span>
              {savedPct != null && <span>{formatPercent(savedPct)} saved</span>}
            </div>
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${formatCurrency(tx.savedAmount)} saved, ${formatCurrency(tx.availableAmount)} spendable`}
            >
              <div
                className="bg-success"
                style={{ width: `${(savedPct ?? 0) * 100}%` }}
              />
              <div className="flex-1 bg-primary/70" />
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-background/70 p-2.5">
                <div className="text-xs text-muted-foreground">To savings vault</div>
                <div className="font-semibold tabular-nums text-success">
                  +{formatCurrency(tx.savedAmount)}
                </div>
              </div>
              <div className="rounded-lg bg-background/70 p-2.5">
                <div className="text-xs text-muted-foreground">Spendable now</div>
                <div className="font-semibold tabular-nums">
                  +{formatCurrency(tx.availableAmount)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="divide-y divide-border/70">
          {tx.sender && <DetailRow label="From">{tx.sender}</DetailRow>}
          {tx.memo && (
            <DetailRow label="Reference">
              <span className="break-words">{tx.memo}</span>
            </DetailRow>
          )}
          <DetailRow label="Network">
            <span className="capitalize">Stellar {network}</span>
          </DetailRow>
          {tx.stellarTxId && (
            <DetailRow label="Transaction hash">
              <CopyHash hash={tx.stellarTxId} />
            </DetailRow>
          )}
        </div>

        {tx.stellarTxId ? (
          <div className="space-y-2.5">
            <Button asChild className="w-full" variant="secondary">
              <a
                href={explorerTxUrl(network, tx.stellarTxId)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" /> Verify on stellar.expert
              </a>
            </Button>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
              Settled on the public Stellar ledger
              {isRemit && " — the savings split was enforced by the RemitWise vault smart contract"}
              . Anyone can verify it independently.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This entry is an internal record and has no on-chain settlement.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

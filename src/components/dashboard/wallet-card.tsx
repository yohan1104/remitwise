"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { Copy, Check, Coins, Loader2, ExternalLink, ShieldCheck, FileCode2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { truncateKey, formatCurrency } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";
import { WithdrawDialog } from "./withdraw-dialog";
import { ReceiveMoneyDialog } from "./receive-dialog";
import { SendMoneyDialog } from "@/components/payments/send-money-dialog";
import { RequestQrDialog } from "@/components/payments/request-qr-dialog";

export function WalletCard() {
  const { data, refresh } = useDashboard();
  const { wallet, chain } = data;
  const [copied, setCopied] = React.useState(false);
  const [provisioning, setProvisioning] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(wallet.publicKey);
    setCopied(true);
    toast.success("Wallet address copied");
    setTimeout(() => setCopied(false), 1600);
  }

  async function activate() {
    setProvisioning(true);
    try {
      const res = await fetch("/api/wallet/provision", { method: "POST" });
      const json = await res.json();
      if (json.trustline) {
        toast.success("Wallet activated on Stellar — trustline established");
        await refresh();
      } else {
        toast.message("Activating… Stellar is busy, please retry in a moment.");
      }
    } finally {
      setProvisioning(false);
    }
  }

  const usdc = wallet.onChain?.availableUsdc ?? wallet.availableBalance;

  return (
    <Card className="gap-4 overflow-hidden">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-4 text-primary" /> Stellar Wallet
          </CardTitle>
          <CardDescription>Receive real USDC on Stellar</CardDescription>
        </div>
        {wallet.provisioned ? (
          <Badge variant="success" className="gap-1">
            <ShieldCheck className="size-3" /> Active
          </Badge>
        ) : (
          <Badge variant="warning">Inactive</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="mx-auto w-fit rounded-2xl bg-white p-3 shadow-sm ring-1 ring-border"
        >
          <QRCodeSVG value={wallet.publicKey} size={126} bgColor="#ffffff" fgColor="#0f2557" level="M" />
        </motion.div>
        <p className="-mt-1 text-center text-xs text-muted-foreground">
          Your wallet code — anyone can scan it in RemitWise to pay you.
        </p>

        <button
          onClick={copy}
          className="group flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-left transition-colors hover:border-primary/40"
        >
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Public address</div>
            <div className="truncate font-mono text-sm">{truncateKey(wallet.publicKey, 8, 8)}</div>
          </div>
          {copied ? (
            <Check className="size-4 shrink-0 text-success" />
          ) : (
            <Copy className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
          )}
        </button>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-secondary/40 p-3">
            <div className="text-xs text-muted-foreground">On-chain USDC</div>
            <div className="mt-0.5 font-semibold tabular-nums">{formatCurrency(usdc)}</div>
          </div>
          <div className="rounded-xl bg-secondary/40 p-3">
            <div className="text-xs text-muted-foreground">In Savings Vault</div>
            <div className="mt-0.5 font-semibold tabular-nums text-success">
              {formatCurrency(wallet.savingsBalance)}
            </div>
          </div>
        </div>

        {/* On-chain proof: the deployed Soroban vault */}
        <a
          href={chain.explorerContractUrl}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 transition-colors hover:border-primary/40"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg brand-gradient text-primary-foreground">
            <FileCode2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Soroban Savings Vault</div>
            <div className="truncate font-mono text-xs">{truncateKey(chain.vaultContractId, 6, 6)}</div>
          </div>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
        </a>

        {/* Gasless: user holds 0 XLM — reserves + fees sponsored by RemitWise */}
        <div className="flex items-center gap-2 rounded-xl bg-success/8 px-3.5 py-2 text-xs">
          <Zap className="size-3.5 shrink-0 text-success" />
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">Gasless</span> — no XLM needed.
            Account reserves and fees are sponsored by RemitWise.
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {!wallet.provisioned ? (
            <Button className="flex-1" onClick={activate} disabled={provisioning}>
              {provisioning ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Activate wallet
            </Button>
          ) : (
            <>
              {/* Everyday money movement, in the order people reach for it. */}
              <div className="grid grid-cols-2 gap-2">
                <SendMoneyDialog className="w-full" />
                <RequestQrDialog className="w-full" />
              </div>
              <ReceiveMoneyDialog className="w-full" />
              <WithdrawDialog className="w-full" />
              <Button asChild variant="outline" className="w-full">
                <a href={chain.explorerAccountUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> View account on explorer
                </a>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

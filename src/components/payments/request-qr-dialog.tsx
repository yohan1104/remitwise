"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Loader2,
  QrCode,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { parseAmountInput, TRANSFER_MAX_USDC, TRANSFER_MIN_USDC } from "@/lib/payments/fees";
import { haptic } from "@/lib/haptics";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { PaymentErrorPanel } from "./payment-error";
import type { PaymentErrorCode } from "@/lib/payments/errors";
import type { PaymentRequestView } from "@/lib/types";

const EXPIRY_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "1440", label: "24 hours" },
];

/**
 * The payee side of QR payments: mint a code, show it, and watch it get paid.
 *
 * The code encodes a deep link, so a payer can scan it inside RemitWise *or*
 * with their phone's stock camera app. Status polls only while the dialog is
 * open and the request is still payable.
 */
export function RequestQrDialog({
  trigger,
  className,
}: {
  trigger?: React.ReactNode;
  className?: string;
}) {
  const { data, refresh } = useDashboard();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [expiry, setExpiry] = React.useState("30");
  const [busy, setBusy] = React.useState(false);
  const [request, setRequest] = React.useState<PaymentRequestView | null>(null);
  const [errorCode, setErrorCode] = React.useState<PaymentErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const qrWrapRef = React.useRef<HTMLDivElement | null>(null);

  const parsedAmount = amount.trim() === "" ? null : parseAmountInput(amount);
  const amountInvalid =
    amount.trim() !== "" &&
    (parsedAmount === null ||
      parsedAmount < TRANSFER_MIN_USDC ||
      parsedAmount > TRANSFER_MAX_USDC);

  function reset() {
    setRequest(null);
    setAmount("");
    setNote("");
    setExpiry("30");
    setErrorCode(null);
    setErrorMessage(null);
    setBusy(false);
    setCopied(false);
  }

  async function create() {
    if (amountInvalid) return;
    setBusy(true);
    setErrorCode(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/payments/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(parsedAmount !== null ? { amount: parsedAmount } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          expiresInMinutes: Number(expiry),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorCode((json.code as PaymentErrorCode) ?? "server_error");
        setErrorMessage(json.error ?? null);
        return;
      }
      haptic("tap");
      setRequest(json.request as PaymentRequestView);
    } catch {
      setErrorCode("network_error");
    } finally {
      setBusy(false);
    }
  }

  // Watch for payment while the code is on screen.
  React.useEffect(() => {
    if (!open || !request || request.status !== "active") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/requests/${request.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const fresh = json.request as PaymentRequestView;
        setRequest(fresh);
        if (fresh.status === "paid") {
          haptic("success");
          toast.success(
            fresh.amountPaid
              ? `${formatCurrency(fresh.amountPaid)} received${fresh.paidBy ? ` from ${fresh.paidBy}` : ""}`
              : "Payment received",
          );
          await refresh();
        }
      } catch {
        /* next tick retries */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [open, request, refresh]);

  async function copyLink() {
    if (!request) return;
    await navigator.clipboard.writeText(request.link);
    setCopied(true);
    toast.success("Payment link copied");
    setTimeout(() => setCopied(false), 1600);
  }

  async function share() {
    if (!request) return;
    const text = request.amount
      ? `Pay me ${formatCurrency(request.amount)} on RemitWise`
      : "Pay me on RemitWise";
    try {
      await navigator.share({ title: "RemitWise payment request", text, url: request.link });
    } catch {
      /* the user dismissed the sheet */
    }
  }

  async function saveImage() {
    const svg = qrWrapRef.current?.querySelector("svg");
    if (!svg || !request) return;
    try {
      await downloadSvgAsPng(svg, `remitwise-payment-${request.id.slice(-6)}.png`);
      toast.success("QR code saved");
    } catch {
      toast.error("Couldn't save the image — try the copy link instead.");
    }
  }

  async function cancel() {
    if (!request) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/requests/${request.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Couldn't cancel that code.");
        return;
      }
      toast.success("Payment code cancelled");
      reset();
    } finally {
      setBusy(false);
    }
  }

  const disabled = !data.wallet.provisioned;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTimeout(reset, 250);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className={className} disabled={disabled}>
            <QrCode className="size-4" /> Request via QR
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md overflow-hidden">
        <AnimatePresence mode="wait">
          {errorCode ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <DialogHeader className="sr-only">
                <DialogTitle>Couldn&apos;t create a payment code</DialogTitle>
              </DialogHeader>
              <PaymentErrorPanel
                code={errorCode}
                message={errorMessage}
                onRecover={() => {
                  setErrorCode(null);
                  setErrorMessage(null);
                }}
                onSecondary={() => setOpen(false)}
                secondaryLabel="Close"
              />
            </motion.div>
          ) : request && request.status === "paid" ? (
            <motion.div
              key="paid"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4 text-center"
            >
              <DialogHeader className="items-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 14 }}
                  className="mx-auto grid size-16 place-items-center rounded-full bg-success/15 text-success"
                >
                  <CheckCircle2 className="size-9" />
                </motion.div>
                <DialogTitle className="mt-2">Payment received</DialogTitle>
                <DialogDescription>
                  {request.amountPaid ? formatCurrency(request.amountPaid) : "Your payment"} landed in
                  your available balance
                  {request.paidBy ? ` from ${request.paidBy}` : ""}.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={reset}>
                  <RefreshCw className="size-4" /> New code
                </Button>
                <Button className="flex-1" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </motion.div>
          ) : request ? (
            <motion.div
              key="code"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="size-4 text-primary" /> Your payment code
                </DialogTitle>
                <DialogDescription>
                  {request.amount
                    ? `Anyone who scans this pays you ${formatCurrency(request.amount)}.`
                    : "Anyone who scans this can pay you — they choose the amount."}
                </DialogDescription>
              </DialogHeader>

              <div
                ref={qrWrapRef}
                className="mx-auto w-fit rounded-2xl bg-white p-4 shadow-sm ring-1 ring-border"
              >
                <QRCodeSVG
                  value={request.link}
                  size={188}
                  bgColor="#ffffff"
                  fgColor="#0f2557"
                  level="M"
                  marginSize={1}
                />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge variant={request.status === "active" ? "success" : "muted"}>
                  {request.status === "active" ? "Waiting for payment" : request.status}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Clock className="size-3" /> <Expiry iso={request.expiresAt} />
                </Badge>
                {request.singleUse && (
                  <Badge variant="outline" className="text-[10px]">
                    single use
                  </Badge>
                )}
              </div>

              {request.note && (
                <p className="text-center text-sm text-muted-foreground">“{request.note}”</p>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={copyLink}>
                  {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  Copy
                </Button>
                <Button variant="outline" onClick={saveImage}>
                  <Download className="size-4" /> Save
                </Button>
                <Button
                  variant="outline"
                  onClick={share}
                  disabled={typeof navigator === "undefined" || !("share" in navigator)}
                >
                  <Share2 className="size-4" /> Share
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-xl bg-secondary/40 px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                Watching for payment…
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1 text-destructive" onClick={cancel} disabled={busy}>
                  <Trash2 className="size-4" /> Cancel code
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -14 }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="size-4 text-primary" /> Request a payment
                </DialogTitle>
                <DialogDescription>
                  Create a QR code someone can scan to pay you instantly, in person.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="rq-amount">Amount (optional)</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="rq-amount"
                    inputMode="decimal"
                    placeholder="Any amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-invalid={amountInvalid}
                    className="pl-7 tabular-nums"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {amountInvalid ? (
                    <span className="text-destructive">
                      Enter an amount between {formatCurrency(TRANSFER_MIN_USDC)} and{" "}
                      {formatCurrency(TRANSFER_MAX_USDC)}.
                    </span>
                  ) : (
                    "Leave blank to let the payer choose — useful for tips or split bills."
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rq-note">Note (optional)</Label>
                  <Input
                    id="rq-note"
                    maxLength={80}
                    placeholder="Lunch, rent share…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Code expires in</Label>
                  <Select value={expiry} onValueChange={setExpiry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full" size="lg" onClick={create} disabled={busy || amountInvalid}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                Create payment code
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function Expiry({ iso }: { iso: string }) {
  const [label, setLabel] = React.useState(() => remaining(iso));
  React.useEffect(() => {
    const timer = setInterval(() => setLabel(remaining(iso)), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  return <>{label}</>;
}

function remaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes >= 60) return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m left`;
  if (totalMinutes >= 1) return `${totalMinutes}m left`;
  return `${Math.ceil(ms / 1000)}s left`;
}

/** Rasterise the on-screen QR so it can be saved or sent as a picture. */
async function downloadSvgAsPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const scale = 3;
  const width = svg.viewBox.baseVal.width || svg.clientWidth || 188;
  const height = svg.viewBox.baseVal.height || svg.clientHeight || 188;
  const source = new XMLSerializer().serializeToString(svg);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Encoding failed");

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

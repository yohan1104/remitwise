"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageUp, Loader2, QrCode, ScanLine, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { preloadDecoder } from "@/lib/qr/decode";
import { parseAmountInput } from "@/lib/payments/fees";
import type { PaymentErrorCode, RecoveryAction } from "@/lib/payments/errors";
import type { QrPaymentPreview, TransferView } from "@/lib/types";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { QrScanner } from "./qr-scanner";
import { QrUpload } from "./qr-upload";
import { PaymentReview } from "./payment-review";
import { PaymentSuccess } from "./payment-success";
import { PaymentErrorPanel } from "./payment-error";

/**
 * ---------------------------------------------------------------------------
 *  Send money by QR — the whole flow, one dialog.
 * ---------------------------------------------------------------------------
 *    method → scan | upload → review → success
 *                     ↑          ↓
 *                     └──── error (with a recovery action)
 *
 *  The camera runs only while the `scan` step is mounted *and* the dialog is
 *  open, so closing the dialog — or moving to review — releases the sensor
 *  immediately. The idempotency key is minted once per resolved payment, so a
 *  retry after a network blip can never send twice.
 * ---------------------------------------------------------------------------
 */

type Step = "method" | "scan" | "upload" | "review" | "success";

interface FlowError {
  code: PaymentErrorCode | null;
  message?: string | null;
  /** Where "back" returns to. */
  from: Step;
}

export function SendMoneyDialog({
  trigger,
  className,
  variant = "outline",
  /** A token from a QR deep link — opens the dialog straight into review. */
  initialPayload,
  onInitialPayloadConsumed,
}: {
  trigger?: React.ReactNode;
  className?: string;
  variant?: "default" | "outline";
  initialPayload?: string | null;
  onInitialPayloadConsumed?: () => void;
}) {
  const { data, refresh } = useDashboard();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("method");
  const [error, setError] = React.useState<FlowError | null>(null);

  const [resolving, setResolving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [preview, setPreview] = React.useState<QrPaymentPreview | null>(null);
  const [transfer, setTransfer] = React.useState<TransferView | null>(null);
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  // Stable for the lifetime of one resolved payment: retries reuse it, so the
  // server recognises them as the same transfer.
  const idempotencyKeyRef = React.useRef<string | null>(null);

  const provisioned = data.wallet.provisioned;
  const available = data.wallet.availableBalance;

  const reset = React.useCallback(() => {
    setStep("method");
    setError(null);
    setPreview(null);
    setTransfer(null);
    setAmount("");
    setNote("");
    setResolving(false);
    setSubmitting(false);
    idempotencyKeyRef.current = null;
  }, []);

  const resolvePayload = React.useCallback(
    async (payload: string, from: Step) => {
      setResolving(true);
      setError(null);
      try {
        const res = await fetch("/api/payments/qr/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          haptic("warning");
          setError({
            code: (json.code as PaymentErrorCode) ?? (res.status === 429 ? "rate_limited" : "server_error"),
            message: json.error,
            from,
          });
          return;
        }
        const next = json.preview as QrPaymentPreview;
        idempotencyKeyRef.current = newIdempotencyKey();
        setPreview(next);
        setAmount(next.amount !== null ? String(next.amount) : "");
        setNote("");
        setStep("review");
      } catch {
        haptic("warning");
        setError({ code: "network_error", from });
      } finally {
        setResolving(false);
      }
    },
    [],
  );

  // Deep link: /qr/<token> lands on the dashboard with ?pay=…
  React.useEffect(() => {
    if (!initialPayload) return;
    onInitialPayloadConsumed?.();
    reset();
    setOpen(true);
    void resolvePayload(initialPayload, "method");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPayload]);

  async function confirm() {
    if (!preview || submitting) return;
    const key = idempotencyKeyRef.current;
    if (!key) return;

    const chosen = preview.amountEditable ? parseAmountInput(amount) : preview.amount;
    if (chosen === null) {
      setError({ code: "amount_invalid", from: "review" });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentToken: preview.intentToken,
          ...(preview.amountEditable ? { amount: chosen } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          idempotencyKey: key,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        haptic("error");
        setError({
          code: (json.code as PaymentErrorCode) ?? (res.status === 429 ? "rate_limited" : "server_error"),
          message: json.error,
          from: "review",
        });
        return;
      }

      const settled = json.transfer as TransferView;
      haptic("success");
      setTransfer(settled);
      setStep("success");
      toast.success(`${formatCurrency(settled.amount)} sent to ${settled.recipient.name}`);
      await refresh();
    } catch {
      haptic("error");
      // The request may still have landed — never auto-retry with a new key.
      setError({ code: "network_error", from: "review" });
    } finally {
      setSubmitting(false);
    }
  }

  function recover(action: RecoveryAction) {
    const from = error?.from ?? "method";
    setError(null);
    switch (action) {
      case "rescan":
        idempotencyKeyRef.current = null;
        setPreview(null);
        setStep(from === "upload" ? "upload" : "scan");
        break;
      case "choose_upload":
        setStep("upload");
        break;
      case "edit_amount":
        setStep("review");
        break;
      case "retry":
        if (from === "review" && preview) void confirm();
        else setStep(from);
        break;
      default:
        setOpen(false);
    }
  }

  const busy = resolving || submitting;
  const disabled = !provisioned || available <= 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Never abandon a payment mid-flight.
        if (!next && submitting) return;
        setOpen(next);
        if (next) preloadDecoder();
        else setTimeout(reset, 250);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={variant} className={className} disabled={disabled}>
            <ScanLine className="size-4" /> Scan &amp; pay
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="size-4 text-primary" />
            {step === "success" ? "Payment complete" : step === "review" ? "Review payment" : "Scan & pay"}
          </DialogTitle>
          <DialogDescription>
            {step === "success"
              ? "Your payment settled on Stellar."
              : step === "review"
                ? "Check the details — payments can't be undone."
                : `Pay anyone instantly from your ${formatCurrency(available)} available balance.`}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {error ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <PaymentErrorPanel
                code={error.code}
                message={error.message}
                onRecover={recover}
                onSecondary={() => {
                  setError(null);
                  setStep("method");
                }}
                secondaryLabel="Start over"
              />
            </motion.div>
          ) : step === "method" ? (
            <motion.div
              key="method"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -14 }}
              className="space-y-3"
            >
              <MethodCard
                icon={ScanLine}
                title="Scan QR code"
                body="Use your camera to read a payment code."
                onClick={() => setStep("scan")}
                disabled={busy}
              />
              <MethodCard
                icon={ImageUp}
                title="Upload QR image"
                body="Pick a photo or screenshot from your device."
                onClick={() => setStep("upload")}
                disabled={busy}
              />
              <div className="rounded-xl bg-secondary/40 px-3.5 py-2.5 text-xs text-muted-foreground">
                Available to send:{" "}
                <span className="font-semibold text-foreground">{formatCurrency(available)}</span>
                {" · "}RemitWise-to-RemitWise payments are free.
              </div>
              {resolving && (
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Checking the payment details…
                </p>
              )}
            </motion.div>
          ) : step === "scan" ? (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <QrScanner
                active={open && step === "scan" && !busy}
                busy={resolving}
                onDetected={(value) => void resolvePayload(value, "scan")}
                onUseUpload={() => setStep("upload")}
              />
            </motion.div>
          ) : step === "upload" ? (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <QrUpload
                busy={resolving}
                onDetected={(value) => void resolvePayload(value, "upload")}
                onUseCamera={() => setStep("scan")}
              />
            </motion.div>
          ) : step === "review" && preview ? (
            <PaymentReview
              key="review"
              preview={preview}
              amount={amount}
              onAmountChange={setAmount}
              note={note}
              onNoteChange={setNote}
              onConfirm={confirm}
              onBack={() => {
                idempotencyKeyRef.current = null;
                setPreview(null);
                setStep("method");
              }}
              submitting={submitting}
            />
          ) : step === "success" && transfer ? (
            <PaymentSuccess
              key="success"
              transfer={transfer}
              onSendAnother={() => {
                reset();
                setStep("scan");
              }}
              onDone={() => setOpen(false)}
            />
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function MethodCard({
  icon: Icon,
  title,
  body,
  onClick,
  disabled,
}: {
  icon: typeof ScanLine;
  title: string;
  body: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic("tap");
        onClick();
      }}
      disabled={disabled}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-secondary/40 disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl brand-gradient text-primary-foreground">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{body}</span>
      </span>
      <Send className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** URL-safe, unguessable, and stable across retries of one confirmation. */
function newIdempotencyKey(): string {
  // randomUUID needs a secure context; getRandomValues does not.
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ImageUp, Loader2, QrCode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, truncateKey } from "@/lib/utils";
import { decodeImageFile, IMAGE_ACCEPT_ATTRIBUTE, MAX_IMAGE_BYTES } from "@/lib/qr/image";
import {
  tryParseScannedValue,
  type ScannedPayment,
} from "@/lib/payments/qr-format";
import { PaymentError, type PaymentErrorCode, type RecoveryAction } from "@/lib/payments/errors";
import { haptic } from "@/lib/haptics";
import { PaymentErrorPanel } from "./payment-error";

interface Candidate {
  value: string;
  parsed: ScannedPayment;
}

/**
 * Decode a QR code from a picture the user already has.
 *
 * Handles the awkward realities of gallery uploads: a poster with several
 * codes on it (we list the payable ones and let the user choose), a screenshot
 * with a code plus a marketing URL (the URL is ignored), and photos big enough
 * to stall a phone (they're downscaled before decoding).
 */
export function QrUpload({
  busy,
  onDetected,
  onUseCamera,
}: {
  busy?: boolean;
  onDetected: (value: string) => void;
  onUseCamera: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [decoding, setDecoding] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [errorCode, setErrorCode] = React.useState<PaymentErrorCode | null>(null);
  const [choices, setChoices] = React.useState<Candidate[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);

  const handleFile = React.useCallback(
    async (file: File) => {
      setErrorCode(null);
      setChoices([]);
      setFileName(file.name);
      setDecoding(true);
      try {
        const codes = await decodeImageFile(file, { multiple: true });
        if (codes.length === 0) {
          setErrorCode("qr_unreadable");
          haptic("warning");
          return;
        }

        // Keep only codes we could actually pay; a poster's website URL
        // shouldn't be presented as a payment option.
        const payable: Candidate[] = [];
        let firstProblem: PaymentErrorCode | null = null;
        for (const code of codes) {
          const parsed = tryParseScannedValue(code.value);
          if (parsed.ok) payable.push({ value: code.value, parsed: parsed.value });
          else firstProblem ??= parsed.code;
        }

        if (payable.length === 0) {
          setErrorCode(firstProblem ?? "qr_unsupported");
          haptic("warning");
          return;
        }
        if (payable.length === 1) {
          haptic("success");
          onDetected(payable[0].value);
          return;
        }
        haptic("tap");
        setChoices(payable);
      } catch (err) {
        setErrorCode(err instanceof PaymentError ? err.code : "image_corrupt");
        haptic("warning");
      } finally {
        setDecoding(false);
      }
    },
    [onDetected],
  );

  // Paste a screenshot straight from the clipboard — the fastest desktop path.
  React.useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file && file.type.startsWith("image/")) {
        event.preventDefault();
        void handleFile(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile]);

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function recover(action: RecoveryAction) {
    setErrorCode(null);
    if (action === "rescan") onUseCamera();
    else inputRef.current?.click();
  }

  if (errorCode) {
    return (
      <div className="space-y-3">
        <PaymentErrorPanel
          compact
          code={errorCode}
          onRecover={recover}
          onSecondary={onUseCamera}
          secondaryLabel="Use camera"
        />
      </div>
    );
  }

  if (choices.length > 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-secondary/50 px-3.5 py-2.5 text-sm">
          <p className="font-medium">We found {choices.length} payment codes</p>
          <p className="text-xs text-muted-foreground">
            Choose the one you meant to pay.
          </p>
        </div>
        <ul className="space-y-2">
          {choices.map((choice) => (
            <li key={choice.value}>
              <button
                type="button"
                onClick={() => {
                  haptic("tap");
                  onDetected(choice.value);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/50 hover:bg-secondary/40"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <QrCode className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {describeCandidate(choice.parsed).title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {describeCandidate(choice.parsed).subtitle}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="outline" className="w-full" onClick={() => setChoices([])}>
          Choose a different image
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-secondary/25"
        }`}
      >
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          {decoding || busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImageUp className="size-5" />
          )}
        </span>
        <p className="mt-3 text-sm font-medium">
          {decoding
            ? "Reading the image…"
            : busy
              ? "Checking the payment details…"
              : "Upload a photo or screenshot"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fileName && !decoding ? `${fileName} · ` : ""}
          PNG, JPEG, WebP, GIF or SVG · up to {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB
        </p>

        <Button
          className="mt-4"
          onClick={() => inputRef.current?.click()}
          disabled={decoding || busy}
        >
          <ImageUp className="size-4" /> Choose image
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label="QR code image"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so re-picking the same file still fires a change event.
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
      </motion.div>

      <p className="text-center text-xs text-muted-foreground">
        You can also drag an image here, or paste one with Ctrl/⌘+V.
      </p>

      <Button variant="outline" className="w-full" onClick={onUseCamera}>
        <ScanLine className="size-4" /> Scan with camera instead
      </Button>
    </div>
  );
}

function describeCandidate(scan: ScannedPayment): { title: string; subtitle: string } {
  switch (scan.kind) {
    case "rw_request":
      return {
        title: `Pay ${scan.payload.n}`,
        subtitle: scan.payload.a
          ? `RemitWise request · ${formatCurrency(scan.payload.a)}`
          : "RemitWise request · you choose the amount",
      };
    case "rw_address":
      return {
        title: `Pay ${scan.payload.n}`,
        subtitle: `RemitWise code · ${truncateKey(scan.payload.g, 6, 6)}`,
      };
    case "sep7":
      return {
        title: scan.label ?? "Stellar payment request",
        subtitle: `${scan.amount ? `${formatCurrency(scan.amount)} · ` : ""}${truncateKey(scan.destination, 6, 6)}`,
      };
    default:
      return {
        title: "Stellar wallet address",
        subtitle: truncateKey(scan.destination, 8, 8),
      };
  }
}

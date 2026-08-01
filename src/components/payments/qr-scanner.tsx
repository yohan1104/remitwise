"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flashlight, FlashlightOff, ImageUp, Loader2, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQrScanner } from "@/lib/qr/use-scanner";
import { haptic } from "@/lib/haptics";
import { PaymentErrorPanel } from "./payment-error";
import type { RecoveryAction } from "@/lib/payments/errors";

/**
 * Live camera scanner.
 *
 * The viewfinder is deliberately plain: a dimmed surround, a bright framing
 * window and a sweeping line. Everything else (torch, lens switch) sits out of
 * the way until the device says it is available.
 */
export function QrScanner({
  active,
  busy,
  onDetected,
  onUseUpload,
}: {
  /** Camera runs only while true — the parent turns it off on every step change. */
  active: boolean;
  /** A code has been captured and is being resolved. */
  busy?: boolean;
  onDetected: (value: string) => void;
  onUseUpload: () => void;
}) {
  const handleDetected = React.useCallback(
    (value: string) => {
      haptic("success");
      onDetected(value);
    },
    [onDetected],
  );

  const scanner = useQrScanner({ active, onDetected: handleDetected });

  function recover(action: RecoveryAction) {
    if (action === "choose_upload") onUseUpload();
    else scanner.retry();
  }

  if (scanner.state === "error") {
    return (
      <div className="rounded-2xl border border-border bg-secondary/30 p-4">
        <PaymentErrorPanel
          compact
          code={scanner.errorCode}
          onRecover={recover}
          onSecondary={onUseUpload}
          secondaryLabel="Upload instead"
        />
      </div>
    );
  }

  const status = busy
    ? "Code captured — checking the payment details…"
    : scanner.state === "scanning"
      ? "Point your camera at a RemitWise QR code"
      : "Starting your camera…";

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-border">
        <video
          ref={scanner.videoRef}
          className={`size-full object-cover transition-opacity duration-500 ${
            scanner.streaming ? "opacity-100" : "opacity-0"
          }`}
          playsInline
          muted
          // Decorative: the live status below is the accessible channel.
          aria-hidden="true"
        />

        {/* Framing window: four brackets over a dimmed surround. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-slate-950/45" />
          <div className="absolute left-1/2 top-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2">
            <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]" />
            {[
              "left-0 top-0 border-l-2 border-t-2 rounded-tl-xl",
              "right-0 top-0 border-r-2 border-t-2 rounded-tr-xl",
              "left-0 bottom-0 border-b-2 border-l-2 rounded-bl-xl",
              "right-0 bottom-0 border-b-2 border-r-2 rounded-br-xl",
            ].map((corner) => (
              <span
                key={corner}
                className={`absolute size-9 border-white/90 ${corner}`}
              />
            ))}

            {scanner.state === "scanning" && !busy && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-x-3 h-0.5 rounded-full bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_12px_2px_rgba(255,255,255,0.6)]"
                initial={{ top: "6%" }}
                animate={{ top: ["6%", "94%", "6%"] }}
                transition={{ duration: 2.6, ease: "easeInOut", repeat: Infinity }}
              />
            )}
          </div>
        </div>

        <AnimatePresence>
          {(!scanner.streaming || busy) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center bg-slate-950/70"
            >
              <div className="flex flex-col items-center gap-2 text-white/90">
                <Loader2 className="size-7 animate-spin" />
                <span className="text-xs font-medium">
                  {busy ? "Reading payment…" : "Starting camera…"}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Device controls — only rendered when the hardware offers them. */}
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          {scanner.torch.supported && (
            <button
              type="button"
              onClick={scanner.torch.toggle}
              aria-pressed={scanner.torch.on}
              aria-label={scanner.torch.on ? "Turn off flashlight" : "Turn on flashlight"}
              className="grid size-10 place-items-center rounded-full bg-slate-950/60 text-white backdrop-blur transition-colors hover:bg-slate-950/80"
            >
              {scanner.torch.on ? (
                <FlashlightOff className="size-4.5" />
              ) : (
                <Flashlight className="size-4.5" />
              )}
            </button>
          )}
          {scanner.canSwitchCamera && (
            <button
              type="button"
              onClick={scanner.switchCamera}
              aria-label="Switch camera"
              className="grid size-10 place-items-center rounded-full bg-slate-950/60 text-white backdrop-blur transition-colors hover:bg-slate-950/80"
            >
              <SwitchCamera className="size-4.5" />
            </button>
          )}
        </div>
      </div>

      <p aria-live="polite" className="text-center text-sm text-muted-foreground">
        {status}
      </p>

      <Button variant="outline" className="w-full" onClick={onUseUpload}>
        <ImageUp className="size-4" /> Upload a QR image instead
      </Button>
    </div>
  );
}

"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ImageUp,
  RefreshCw,
  ScanLine,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { paymentErrorInfo, type RecoveryAction } from "@/lib/payments/errors";

const RECOVERY_ICON: Record<RecoveryAction, typeof ScanLine> = {
  rescan: ScanLine,
  retry: RefreshCw,
  edit_amount: Wallet,
  choose_upload: ImageUp,
  open_settings: RefreshCw,
  add_funds: Wallet,
  dismiss: ArrowLeft,
};

/**
 * One presentation for every payment failure: what happened, in plain words,
 * plus the single action most likely to fix it. Announced to screen readers
 * because a failed payment is exactly the moment a user must not miss.
 */
export function PaymentErrorPanel({
  code,
  message,
  onRecover,
  onSecondary,
  secondaryLabel = "Back",
  compact,
}: {
  code: string | null | undefined;
  /** Server-supplied text, when it is more specific than the catalogue copy. */
  message?: string | null;
  onRecover?: (action: RecoveryAction) => void;
  onSecondary?: () => void;
  secondaryLabel?: string;
  compact?: boolean;
}) {
  const info = paymentErrorInfo(code);
  const Icon = RECOVERY_ICON[info.recovery];

  return (
    <motion.div
      role="alert"
      aria-live="assertive"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={compact ? "space-y-3" : "space-y-4 py-2 text-center"}
    >
      <div className={compact ? "flex items-start gap-3" : "flex flex-col items-center gap-3"}>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-destructive/12 text-destructive">
          <AlertTriangle className="size-5" />
        </span>
        <div className={compact ? "min-w-0" : ""}>
          <p className="font-semibold leading-tight">{info.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message || info.message}</p>
        </div>
      </div>

      <div className={compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row-reverse"}>
        {onRecover && (
          <Button className="flex-1" onClick={() => onRecover(info.recovery)}>
            <Icon className="size-4" />
            {info.recoveryLabel}
          </Button>
        )}
        {onSecondary && (
          <Button variant="outline" className="flex-1" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

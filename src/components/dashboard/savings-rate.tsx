"use client";

import * as React from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { formatPercent } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";

export function SavingsRateDialog() {
  const { data, refresh } = useDashboard();
  const [open, setOpen] = React.useState(false);
  const [rate, setRate] = React.useState(Math.round(data.savingsRate * 100));
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setRate(Math.round(data.savingsRate * 100));
  }, [open, data.savingsRate]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/savings-rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: rate / 100 }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Auto-save rate set to ${rate}%`);
      setOpen(false);
      await refresh();
    } catch {
      toast.error("Could not update rate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Adjust savings rate">
          <SlidersHorizontal className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Auto-savings rate</DialogTitle>
          <DialogDescription>
            The share of every remittance saved automatically. Enforced on-chain by
            the Soroban vault — saving takes a few seconds to confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="text-center">
          <div className="text-5xl font-bold text-gradient tabular-nums">
            {formatPercent(rate / 100)}
          </div>
        </div>
        <input
          type="range"
          min={5}
          max={90}
          step={5}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>5%</span>
          <span>90%</span>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Save rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

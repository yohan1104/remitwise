"use client";

import * as React from "react";
import { Check, Globe, Loader2, SlidersHorizontal, Sparkles, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";
import { SimulateRemittanceButton } from "./simulate";
import { ReceiveMoneyDialog } from "./receive-dialog";

function StepBubble({
  state,
  index,
}: {
  state: "done" | "active" | "todo";
  index: number;
}) {
  if (state === "done") {
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success/15 text-success">
        <Check className="size-4" />
      </span>
    );
  }
  return (
    <span
      className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
        state === "active"
          ? "bg-primary/15 text-primary"
          : "bg-secondary text-muted-foreground"
      }`}
    >
      {index}
    </span>
  );
}

/**
 * First-run checklist — shown until the first remittance settles, so a brand
 * new account (judge or real user) is guided to the "aha" moment instead of
 * an empty dashboard.
 */
export function GetStartedCard({ userId }: { userId: string }) {
  const { data } = useDashboard();
  // Default to visible so SSR renders the card for the common case (a new
  // account that never dismissed it); the rare dismissed case hides on mount.
  const storageKey = `remitwise:get-started:${userId}`;
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (localStorage.getItem(storageKey) === "1") setDismissed(true);
  }, [storageKey]);

  if (data.totals.remittanceCount > 0 || dismissed) return null;

  const provisioned = data.wallet.provisioned;

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  return (
    <section
      aria-label="Get started"
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss getting-started guide"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="size-4" /> Welcome to RemitWise
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Three steps to your first auto-saved remittance — everything settles on
        the Stellar blockchain, no crypto knowledge needed.
      </p>

      <ol className="mt-4 space-y-4">
        <li className="flex items-start gap-3">
          {provisioned ? (
            <StepBubble state="done" index={1} />
          ) : (
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Loader2 className="size-4 animate-spin" />
            </span>
          )}
          <div className="min-w-0">
            <p className="font-medium leading-7">
              {provisioned ? "Wallet activated on Stellar" : "Activating your wallet…"}
            </p>
            <p className="text-sm text-muted-foreground">
              {provisioned
                ? "Reserves and your USDC trustline are sponsored — you hold zero XLM."
                : "RemitWise is sponsoring your account on-chain. This takes a few seconds."}
            </p>
          </div>
        </li>

        <li className="flex items-start gap-3">
          <StepBubble state={provisioned ? "active" : "todo"} index={2} />
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-7">Receive your first remittance</p>
            <p className="text-sm text-muted-foreground">
              Try a simulated payment (a real testnet transaction), or create a
              checkout link your sender abroad can pay in their currency.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <SimulateRemittanceButton
                trigger={
                  <Button size="sm" disabled={!provisioned}>
                    <Zap className="size-4" /> Simulate a remittance
                  </Button>
                }
              />
              <ReceiveMoneyDialog
                trigger={
                  <Button size="sm" variant="outline" disabled={!provisioned}>
                    <Globe className="size-4" /> Receive from abroad
                  </Button>
                }
              />
            </div>
          </div>
        </li>

        <li className="flex items-start gap-3">
          <StepBubble state="todo" index={3} />
          <div className="min-w-0">
            <p className="font-medium leading-7">Watch the auto-save do its work</p>
            <p className="text-sm text-muted-foreground">
              The Soroban vault keeps {formatPercent(data.savingsRate)} of every
              payment for your goals — enforced by a smart contract, not a
              promise.{" "}
              <a href="#plan" className="font-medium text-primary hover:underline">
                <SlidersHorizontal className="mr-0.5 inline size-3.5" />
                Tune your savings plan
              </a>
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}

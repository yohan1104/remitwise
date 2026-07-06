"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  Wallet,
  PiggyBank,
  Percent,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent, formatPhp } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";

/** Smoothly animate a number toward its target value. */
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = React.useState(target);
  const prev = React.useRef(target);
  React.useEffect(() => {
    const from = prev.current;
    const diff = target - from;
    if (diff === 0) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + diff * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatCard({
  icon: Icon,
  label,
  value,
  render,
  accent,
  index,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  render: (v: number) => string;
  accent: string;
  index: number;
  sub?: string;
}) {
  const animated = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="card-hover gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span
            className="grid size-9 place-items-center rounded-lg"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            <Icon className="size-4.5" />
          </span>
        </div>
        <div className="text-2xl font-bold tracking-tight tabular-nums">
          {render(animated)}
        </div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </Card>
    </motion.div>
  );
}

export function StatCards() {
  const { data } = useDashboard();
  const { totals, savingsRate, fx } = data;
  const php = (usd: number) => `≈ ${formatPhp(usd, fx.usdPhp)}`;

  const cards = [
    {
      icon: ArrowDownToLine,
      label: "Total Remittances",
      value: totals.totalRemittances,
      render: (v: number) => formatCurrency(v),
      accent: "#2563eb",
      sub: `${php(totals.totalRemittances)} · ${totals.remittanceCount} transfer${totals.remittanceCount === 1 ? "" : "s"}`,
    },
    {
      icon: Wallet,
      label: "Available Balance",
      value: totals.availableBalance,
      render: (v: number) => formatCurrency(v),
      accent: "#0891b2",
      sub: `${php(totals.availableBalance)} · Ready to spend`,
    },
    {
      icon: PiggyBank,
      label: "Savings Balance",
      value: totals.savingsBalance,
      render: (v: number) => formatCurrency(v),
      accent: "#059669",
      sub: `${php(totals.savingsBalance)} · In the on-chain vault`,
    },
    {
      icon: Percent,
      label: "Savings Rate",
      value: savingsRate * 100,
      render: (v: number) => formatPercent(v / 100),
      accent: "#7c3aed",
      sub: "Auto-saved per remittance",
    },
  ];

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => (
          <StatCard key={c.label} index={i} {...c} />
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <span
          className={`size-1.5 rounded-full ${fx.oracleLive ? "bg-success" : "bg-muted-foreground/50"}`}
        />
        1 USD = ₱{fx.usdPhp.toFixed(2)} ·{" "}
        {fx.source === "reflector"
          ? "live via Reflector oracle"
          : fx.oracleLive
            ? "Reflector oracle connected · PHP reference rate (testnet feed)"
            : "reference rate"}
      </div>
    </div>
  );
}

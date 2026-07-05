"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  PiggyBank,
  Target,
  TrendingUp,
  Lightbulb,
  Wallet,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "./dashboard-context";
import { goalMeta } from "@/lib/constants";
import type { AiInsight } from "@/lib/types";

const KIND_META: Record<AiInsight["kind"], { icon: typeof Sparkles; color: string }> = {
  savings: { icon: PiggyBank, color: "#059669" },
  goal: { icon: Target, color: "#2563eb" },
  spending: { icon: Wallet, color: "#0891b2" },
  forecast: { icon: TrendingUp, color: "#7c3aed" },
  advice: { icon: Lightbulb, color: "#d97706" },
};

export function InsightsPanel() {
  const { data, refresh } = useDashboard();
  const [insights, setInsights] = React.useState<AiInsight[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState<string | null>(null);
  const version = data.totals.remittanceCount + data.goals.length;

  async function runAction(insight: AiInsight) {
    const action = insight.action;
    if (!action) return;
    setActing(insight.id);
    try {
      if (action.kind === "raise_rate") {
        const res = await fetch("/api/settings/savings-rate", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rate: action.value }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success(`Auto-save rate raised to ${Math.round((action.value ?? 0) * 100)}%`);
      } else if (action.kind === "create_emergency") {
        const meta = goalMeta("emergency");
        const res = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Emergency Fund",
            category: "emergency",
            targetAmount: action.value ?? 2000,
            color: meta.color,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success("Emergency Fund created");
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActing(null);
    }
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insights", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setInsights(json.insights ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md brand-gradient text-primary-foreground">
              <Sparkles className="size-3.5" />
            </span>
            AI Financial Insights
          </CardTitle>
          <CardDescription>Personalized to your real numbers</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={load}
          disabled={loading}
          aria-label="Regenerate insights"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !insights ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border/60 p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </>
        ) : (
          <AnimatePresence mode="popLayout">
            {insights?.map((ins, i) => {
              const meta = KIND_META[ins.kind] ?? KIND_META.advice;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={ins.id}
                  layout
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex gap-3 rounded-xl border border-border/60 bg-secondary/25 p-4"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{ins.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {ins.body}
                    </p>
                    {ins.action && ins.action.kind !== "none" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2.5 h-8"
                        disabled={acting === ins.id}
                        onClick={() => runAction(ins)}
                      >
                        {acting === ins.id && <RefreshCw className="size-3.5 animate-spin" />}
                        {ins.action.label}
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </CardContent>
    </Card>
  );
}

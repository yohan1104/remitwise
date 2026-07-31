"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SlidersHorizontal, Wand2, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { goalMeta } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { suggestAllocations } from "@/lib/savings/allocation";
import { PriorityBadge } from "@/components/onboarding/wizard";
import { useDashboard } from "./dashboard-context";

/**
 * Savings Plan (allocation center): decide how every saved amount is split
 * across goals. Live pie + validation that shares total exactly 100%.
 */
export function AllocationCenter() {
  const { data, refresh } = useDashboard();
  const planable = data.goals.filter(
    (g) => g.status === "active" && !g.isCompleted && !g.claimedAt,
  );

  // Seed from server data on first render (not an effect) so SSR markup
  // matches the real plan — no 0% flash before hydration.
  const [draft, setDraft] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(planable.map((g) => [g.id, Math.round(g.allocationPct)])),
  );
  const [busy, setBusy] = React.useState(false);

  // Rebuild the draft whenever the underlying plan changes.
  const planKey = data.goals
    .map((g) => `${g.id}:${g.allocationPct}:${g.status}`)
    .join("|");
  const lastKey = React.useRef(planKey);
  React.useEffect(() => {
    if (lastKey.current === planKey) return;
    lastKey.current = planKey;
    setDraft(Object.fromEntries(planable.map((g) => [g.id, Math.round(g.allocationPct)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  if (planable.length === 0) return null;

  const total = Math.round(Object.values(draft).reduce((s, v) => s + v, 0));
  const balanced = total === 100;
  const dirty = planable.some((g) => Math.round(g.allocationPct) !== (draft[g.id] ?? 0));
  const avgSave = data.totals.avgSavedPerRemittance;

  function suggest() {
    const pcts = suggestAllocations(planable);
    setDraft(Object.fromEntries(planable.map((g, i) => [g.id, pcts[i] ?? 0])));
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/goals/allocation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations: planable.map((g) => ({ goalId: g.id, pct: draft[g.id] ?? 0 })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Savings plan updated");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save plan.");
    } finally {
      setBusy(false);
    }
  }

  const slices = planable
    .filter((g) => (draft[g.id] ?? 0) > 0)
    .map((g) => ({ name: g.name, value: draft[g.id] ?? 0, color: g.color }));

  return (
    <Card className="gap-5">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" /> Savings Plan
          </CardTitle>
          <CardDescription>
            How every saved amount is split across your goals
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={balanced ? "success" : "warning"} className="tabular-nums">
            {total}%{balanced ? " ✓" : " / 100%"}
          </Badge>
          <Button variant="outline" size="sm" onClick={suggest}>
            <Wand2 className="size-3.5" /> Suggest
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 grid-cols-1 md:grid-cols-[1fr_210px]">
          <div className="space-y-3">
            {planable.map((g) => {
              const meta = goalMeta(g.category);
              const Icon = meta.icon;
              const pct = draft[g.id] ?? 0;
              const perRemit = avgSave > 0 ? avgSave * (pct / 100) : 0;
              return (
                <div key={g.id} className="rounded-xl border border-border/60 bg-secondary/25 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg"
                        style={{ backgroundColor: `${g.color}1f`, color: g.color }}>
                        <Icon className="size-4" />
                      </span>
                      <span className="truncate text-sm font-semibold">{g.name}</span>
                      <PriorityBadge priority={g.priority} />
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: g.color }}>
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range" min={0} max={100} step={5} value={pct}
                      onChange={(e) => setDraft((d) => ({ ...d, [g.id]: Number(e.target.value) }))}
                      className="w-full accent-[var(--primary)]"
                      aria-label={`${g.name} share of savings`}
                    />
                  </div>
                  {perRemit > 0 && pct > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      ≈ {formatCurrency(perRemit)} per remittance at your current pace
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-[170px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices.length ? slices : [{ name: "Unassigned", value: 1, color: "var(--secondary)" }]}
                    dataKey="value" nameKey="name" innerRadius={46} outerRadius={70}
                    paddingAngle={2} stroke="none">
                    {(slices.length ? slices : [{ name: "Unassigned", value: 1, color: "var(--secondary)" }]).map(
                      (s) => <Cell key={s.name} fill={s.color} />,
                    )}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v}%`, n]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <Button className="w-full" onClick={save} disabled={!balanced || !dirty || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save plan
            </Button>
            {!balanced && (
              <p className="text-center text-[11px] text-muted-foreground">
                Shares must total exactly 100% to save.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

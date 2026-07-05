"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { TrendingUp, BarChart3, PieChart as PieIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useDashboard } from "./dashboard-context";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {label && <div className="mb-1 font-medium text-foreground">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize">{p.name}</span>
          <span className="ml-auto font-semibold text-foreground">
            {formatCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function SavingsOverTimeChart() {
  const { data } = useDashboard();
  const series = data.charts.savingsOverTime;

  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Savings over time
          </CardTitle>
          <CardDescription>Cumulative savings vs. spendable balance</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {series.length <= 1 ? (
          <EmptyChart text="Receive a remittance to see your savings grow." />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="gSavings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gAvail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={54}
                tickFormatter={(v) => formatCurrency(v, { compact: true })}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="available"
                name="available"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#gAvail)"
              />
              <Area
                type="monotone"
                dataKey="savings"
                name="savings"
                stroke="var(--chart-3)"
                strokeWidth={2.5}
                fill="url(#gSavings)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function SpendVsSaveChart() {
  const { data } = useDashboard();
  const series = data.charts.spendVsSave;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" /> Spending vs. Savings
        </CardTitle>
        <CardDescription>How each remittance was split</CardDescription>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <EmptyChart text="No remittances yet." />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series} margin={{ left: -18, right: 6, top: 6 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={54}
                tickFormatter={(v) => formatCurrency(v, { compact: true })}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
              <Bar dataKey="spendable" name="spendable" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saved" name="saved" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function GoalAllocationChart() {
  const { data } = useDashboard();
  const slices = data.charts.goalAllocation;
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieIcon className="size-4 text-primary" /> Goal Allocation
        </CardTitle>
        <CardDescription>Where your savings are working</CardDescription>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <EmptyChart text="Create a goal and start allocating savings." />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={200} className="max-w-[220px]">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={2}
                  stroke="none"
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full space-y-2">
              {slices.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="truncate text-muted-foreground">{s.name}</span>
                  <span className="ml-auto font-medium tabular-nums">
                    {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { motion } from "framer-motion";
import { HeartPulse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboard } from "./dashboard-context";

export function FinancialHealthCard() {
  const { data } = useDashboard();
  const { score, label, factors } = data.financialHealth;

  const R = 46;
  const C = 2 * Math.PI * R;
  const offset = C - (score / 100) * C;

  const tone =
    score >= 85 ? "success" : score >= 45 ? "default" : "warning";

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="size-4 text-primary" /> Financial Health
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="relative grid size-32 shrink-0 place-items-center">
          <svg viewBox="0 0 110 110" className="size-32 -rotate-90">
            <circle cx="55" cy="55" r={R} fill="none" stroke="var(--secondary)" strokeWidth="9" />
            <motion.circle
              cx="55"
              cy="55"
              r={R}
              fill="none"
              stroke="url(#healthGrad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
            <defs>
              <linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" />
                <stop offset="100%" stopColor="var(--chart-3)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-3xl font-bold tabular-nums">{score}</span>
            <span className="text-[11px] text-muted-foreground">/ 100</span>
          </div>
        </div>

        <div className="w-full space-y-2.5">
          <Badge variant={tone as "success" | "default" | "warning"}>{label}</Badge>
          {factors.map((f) => (
            <div key={f.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-medium tabular-nums">{f.value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full rounded-full brand-gradient"
                  initial={{ width: 0 }}
                  animate={{ width: `${f.value}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

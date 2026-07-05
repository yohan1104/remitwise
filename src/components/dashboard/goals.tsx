"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Loader2,
  Trash2,
  CheckCircle2,
  Target as TargetIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency } from "@/lib/utils";
import { GOAL_CATEGORIES, goalMeta } from "@/lib/constants";
import { useDashboard } from "./dashboard-context";
import type { GoalView } from "@/lib/types";

export function GoalsSection() {
  const { data } = useDashboard();
  const goals = data.goals;

  return (
    <Card className="gap-5">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TargetIcon className="size-4 text-primary" /> Savings Goals
          </CardTitle>
          <CardDescription>
            Funded automatically from every remittance
          </CardDescription>
        </div>
        <CreateGoalDialog />
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <TargetIcon className="size-5" />
            </div>
            <div>
              <p className="font-medium">No goals yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first goal — your savings will start filling it automatically.
              </p>
            </div>
            <CreateGoalDialog trigger={<Button size="sm"><Plus className="size-4" /> Create a goal</Button>} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {goals.map((g, i) => (
                <GoalCard key={g.id} goal={g} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GoalCard({ goal, index }: { goal: GoalView; index: number }) {
  const { refresh } = useDashboard();
  const meta = goalMeta(goal.category);
  const Icon = meta.icon;
  const pct = Math.round(goal.progress * 100);
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      toast.success(`Removed "${goal.name}"`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.05 }}
      className="group relative rounded-2xl border border-border/70 bg-secondary/25 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${goal.color}1f`, color: goal.color }}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate font-semibold">{goal.name}</h4>
            {goal.isCompleted && (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="size-3" /> Funded
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)}
          </p>
        </div>
        <button
          onClick={remove}
          disabled={busy}
          aria-label="Delete goal"
          className="text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>

      <div className="mt-4 space-y-1.5">
        <Progress
          value={pct}
          indicatorStyle={{
            backgroundImage: `linear-gradient(90deg, ${goal.color}, ${goal.color}bb)`,
          }}
        />
        <div className="flex justify-between text-xs">
          <span className="font-medium" style={{ color: goal.color }}>{pct}%</span>
          <span className="text-muted-foreground">
            {formatCurrency(Math.max(0, goal.targetAmount - goal.currentAmount))} to go
          </span>
        </div>
      </div>

      {!goal.isCompleted && <ContributeControl goal={goal} />}
    </motion.div>
  );
}

function ContributeControl({ goal }: { goal: GoalView }) {
  const { data, refresh } = useDashboard();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const available = data.totals.availableBalance;

  async function contribute() {
    const value = Number(amount);
    if (!(value > 0)) return toast.error("Enter an amount.");
    if (value > available) return toast.error("Not enough available balance.");
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`Added ${formatCurrency(value)} to ${goal.name}`);
      setOpen(false);
      setAmount("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="mt-3 w-full text-xs">
          <Plus className="size-3.5" /> Add funds
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to {goal.name}</DialogTitle>
          <DialogDescription>
            Move funds from your available balance ({formatCurrency(available)}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="contrib">Amount (USDC)</Label>
          <Input
            id="contrib"
            type="number"
            min={0}
            placeholder="50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={contribute} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Add funds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateGoalDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { refresh } = useDashboard();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [category, setCategory] = React.useState("emergency");
  const [name, setName] = React.useState("Emergency Fund");
  const [target, setTarget] = React.useState("2000");

  function onCategory(value: string) {
    setCategory(value);
    const meta = goalMeta(value);
    setName(meta.label);
    setTarget(String(meta.suggestedTarget));
  }

  async function create() {
    if (name.trim().length < 2) return toast.error("Name your goal.");
    if (!(Number(target) > 0)) return toast.error("Enter a target amount.");
    setBusy(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          targetAmount: Number(target),
          color: goalMeta(category).color,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Goal created");
      setOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Plus className="size-4" /> New goal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Create a savings goal
          </DialogTitle>
          <DialogDescription>
            Pick a category — we&apos;ll suggest a target you can adjust.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {GOAL_CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = c.value === category;
            return (
              <button
                key={c.value}
                onClick={() => onCategory(c.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                  active
                    ? "border-primary bg-primary/8 ring-2 ring-primary/25"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <span
                  className="grid size-8 place-items-center rounded-lg"
                  style={{ backgroundColor: `${c.color}1f`, color: c.color }}
                >
                  <Icon className="size-4" />
                </span>
                <span className="text-[11px] font-medium leading-tight">{c.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Goal name</Label>
            <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goal-target">Target (USDC)</Label>
            <Input
              id="goal-target"
              type="number"
              min={0}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={create} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Create goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

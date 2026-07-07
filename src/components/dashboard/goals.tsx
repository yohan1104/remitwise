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
  ArrowUpFromLine,
  MoreHorizontal,
  Pencil,
  Pause,
  Play,
  Archive,
  CalendarClock,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";
import { GOAL_CATEGORIES, goalMeta } from "@/lib/constants";
import { PriorityBadge } from "@/components/onboarding/wizard";
import { useDashboard } from "./dashboard-context";
import type { GoalView, GoalPriority } from "@/lib/types";

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITIES: GoalPriority[] = ["high", "medium", "low"];

export function GoalsSection() {
  const { data } = useDashboard();
  const [showArchived, setShowArchived] = React.useState(false);
  // Active first (by priority), then paused, then claimed; archived behind a toggle.
  const sorted = [...data.goals].sort((a, b) => {
    const rank = (g: GoalView) =>
      g.claimedAt ? 3 : g.status === "archived" ? 4 : g.status === "paused" ? 2 : g.isCompleted ? 1 : 0;
    return (
      rank(a) - rank(b) ||
      (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
    );
  });
  const archivedCount = sorted.filter((g) => g.status === "archived").length;
  const goals = showArchived ? sorted : sorted.filter((g) => g.status !== "archived");

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
          <>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {goals.map((g, i) => (
                  <GoalCard key={g.id} goal={g} index={i} />
                ))}
              </AnimatePresence>
            </div>
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="mt-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {showArchived ? "Hide" : "Show"} {archivedCount} archived goal
                {archivedCount === 1 ? "" : "s"}
              </button>
            )}
          </>
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
  const [editOpen, setEditOpen] = React.useState(false);

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

  async function setStatus(status: "active" | "paused" | "archived") {
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(
        status === "paused"
          ? `Paused "${goal.name}" — it won't receive savings`
          : status === "archived"
            ? `Archived "${goal.name}"`
            : `Resumed "${goal.name}"`,
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  const claimed = Boolean(goal.claimedAt);
  const paused = goal.status === "paused";
  const archived = goal.status === "archived";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.05 }}
      className={`group relative rounded-2xl border border-border/70 bg-secondary/25 p-4 ${claimed || archived ? "opacity-70" : paused ? "opacity-85" : ""}`}
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
            {claimed ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="size-3" /> Claimed
              </Badge>
            ) : archived ? (
              <Badge variant="muted">Archived</Badge>
            ) : paused ? (
              <Badge variant="warning" className="gap-1">
                <Pause className="size-3" /> Paused
              </Badge>
            ) : goal.isCompleted ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="size-3" /> Funded
              </Badge>
            ) : (
              <PriorityBadge priority={goal.priority} />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {claimed
              ? `${formatCurrency(goal.currentAmount)} withdrawn to spendable`
              : `${formatCurrency(goal.currentAmount)} of ${formatCurrency(goal.targetAmount)}`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Options for ${goal.name}`}
              className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!claimed && !archived && (
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit goal
              </DropdownMenuItem>
            )}
            {!claimed && !goal.isCompleted && !archived && (
              <DropdownMenuItem onClick={() => setStatus(paused ? "active" : "paused")}>
                {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {paused ? "Resume saving" : "Pause saving"}
              </DropdownMenuItem>
            )}
            {!archived ? (
              <DropdownMenuItem onClick={() => setStatus("archived")}>
                <Archive className="size-4" /> Archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setStatus("active")}>
                <Play className="size-4" /> Restore
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={remove} className="text-destructive focus:text-destructive">
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EditGoalDialog goal={goal} open={editOpen} onOpenChange={setEditOpen} />

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

      {!claimed && !archived && !goal.isCompleted && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {goal.allocationPct > 0 && (
            <span>
              <span className="font-medium text-foreground">{Math.round(goal.allocationPct)}%</span> of savings
            </span>
          )}
          {!paused && goal.etaRemittances != null && goal.etaRemittances <= 60 && (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3" />≈ {goal.etaRemittances} remittance
              {goal.etaRemittances === 1 ? "" : "s"} to go
            </span>
          )}
          {goal.targetDate && (
            <span>by {new Date(goal.targetDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
          )}
        </div>
      )}

      {claimed || archived || paused ? null : goal.isCompleted ? (
        <WithdrawGoalControl goal={goal} />
      ) : (
        <ContributeControl goal={goal} />
      )}
    </motion.div>
  );
}

function EditGoalDialog({
  goal, open, onOpenChange,
}: {
  goal: GoalView;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { refresh } = useDashboard();
  const [name, setName] = React.useState(goal.name);
  const [target, setTarget] = React.useState(String(goal.targetAmount));
  const [priority, setPriority] = React.useState<GoalPriority>(goal.priority);
  const [date, setDate] = React.useState(goal.targetDate ? goal.targetDate.slice(0, 10) : "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(goal.name);
      setTarget(String(goal.targetAmount));
      setPriority(goal.priority);
      setDate(goal.targetDate ? goal.targetDate.slice(0, 10) : "");
    }
  }, [open, goal]);

  async function save() {
    if (name.trim().length < 2) return toast.error("Name your goal.");
    if (!(Number(target) > 0)) return toast.error("Enter a target amount.");
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          targetAmount: Number(target),
          priority,
          targetDate: date || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Goal updated");
      onOpenChange(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {goal.name}</DialogTitle>
          <DialogDescription>Change the name, target, priority or deadline.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-name-${goal.id}`}>Goal name</Label>
            <Input id={`edit-name-${goal.id}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-target-${goal.id}`}>Target (USDC)</Label>
              <Input id={`edit-target-${goal.id}`} type="number" min={1} value={target}
                onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-date-${goal.id}`}>Target date</Label>
              <Input id={`edit-date-${goal.id}`} type="date" value={date}
                onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <div className="flex rounded-lg bg-secondary p-0.5">
              {PRIORITIES.map((p) => (
                <button key={p} onClick={() => setPriority(p)} type="button"
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                    priority === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawGoalControl({ goal }: { goal: GoalView }) {
  const { refresh } = useDashboard();
  const [busy, setBusy] = React.useState(false);

  async function withdraw() {
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/withdraw`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(`${formatCurrency(json.result.amount)} withdrawn to your spendable balance`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Withdrawal failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="success"
      size="sm"
      className="mt-3 w-full text-xs"
      onClick={withdraw}
      disabled={busy}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpFromLine className="size-3.5" />}
      Withdraw {formatCurrency(goal.currentAmount)} to wallet
    </Button>
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
  const [priority, setPriority] = React.useState<GoalPriority>("medium");

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
          priority,
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

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
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
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <div className="flex rounded-lg bg-secondary p-0.5">
            {PRIORITIES.map((p) => (
              <button key={p} onClick={() => setPriority(p)} type="button"
                className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                  priority === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {p}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            New goals start at 0% of savings — rebalance in the Savings Plan section below.
          </p>
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

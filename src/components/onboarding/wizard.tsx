"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowLeft, Loader2, Eye, EyeOff, CheckCircle2, Plus, Trash2,
  Wallet, PiggyBank, Target as TargetIcon, Sparkles, Wand2, PartyPopper, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GOAL_CATEGORIES, goalMeta } from "@/lib/constants";
import { cn, formatCurrency } from "@/lib/utils";
import { suggestAllocations } from "@/lib/savings/allocation";
import type { GoalPriority } from "@/lib/types";

/* ----------------------------------------------------------------------- */
/*  Types & helpers                                                          */
/* ----------------------------------------------------------------------- */

interface DraftGoal {
  key: string;
  name: string;
  category: string;
  targetAmount: number;
  targetDate: string; // yyyy-mm-dd or ""
  priority: GoalPriority;
  allocationPct: number;
}

const RATE_PRESETS = [10, 15, 20, 25, 30];
const PRIORITIES: { value: GoalPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  const capped = Math.min(4, score);
  return {
    score: capped,
    label: ["Too short", "Weak", "Okay", "Strong", "Excellent"][capped],
  };
}

const stepAnim = {
  initial: { opacity: 0, x: 28 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -28 },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
};

/* ----------------------------------------------------------------------- */
/*  Wizard shell                                                             */
/* ----------------------------------------------------------------------- */

export function OnboardingWizard({
  mode,
  initialRate = 0.2,
}: {
  mode: "register" | "resume";
  initialRate?: number;
}) {
  const router = useRouter();
  const steps = React.useMemo(
    () =>
      mode === "register"
        ? ["Account", "Welcome", "Auto-save", "Goals", "Plan", "Review", "Done"]
        : ["Welcome", "Auto-save", "Goals", "Plan", "Review", "Done"],
    [mode],
  );
  const [step, setStep] = React.useState(0);
  const [ratePct, setRatePct] = React.useState(Math.round(initialRate * 100));
  const [goals, setGoals] = React.useState<DraftGoal[]>([]);

  const label = steps[step];
  const isAccount = label === "Account";
  const isDone = label === "Done";
  const progress = ((step + 1) / steps.length) * 100;

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const jump = (name: string) => {
    const idx = steps.indexOf(name);
    if (idx >= 0) setStep(idx);
  };

  // Skip the Plan step entirely when the user created no goals.
  const advanceFromGoals = () => {
    if (goals.length === 0) jump("Review");
    else next();
  };

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] grid-backdrop" />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
        <Link href="/"><Logo size={28} /></Link>
        <div className="flex items-center gap-3">
          {!isDone && (
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {steps.length}
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>
      {/* progress */}
      <div className="mx-auto w-full max-w-3xl px-5">
        <div className="h-1 overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full rounded-full brand-gradient"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8">
        <AnimatePresence mode="wait">
          <motion.div key={label} {...stepAnim} className="flex flex-1 flex-col">
            {isAccount && <AccountStep onCreated={next} />}
            {label === "Welcome" && <WelcomeStep onNext={next} onBack={mode === "register" ? undefined : undefined} />}
            {label === "Auto-save" && (
              <RateStep ratePct={ratePct} setRatePct={setRatePct} onNext={next} onBack={back} />
            )}
            {label === "Goals" && (
              <GoalsStep goals={goals} setGoals={setGoals} onNext={advanceFromGoals} onBack={back} />
            )}
            {label === "Plan" && (
              <PlanStep goals={goals} setGoals={setGoals} onNext={next} onBack={back} />
            )}
            {label === "Review" && (
              <ReviewStep
                ratePct={ratePct}
                goals={goals}
                onEditRate={() => jump("Auto-save")}
                onEditGoals={() => jump("Goals")}
                onNext={next}
                onBack={() => (goals.length === 0 ? jump("Goals") : back())}
              />
            )}
            {isDone && (
              <DoneStep
                ratePct={ratePct}
                goals={goals}
                onFinished={() => {
                  router.push("/dashboard");
                  router.refresh();
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Step 1 — Account                                                         */
/* ----------------------------------------------------------------------- */

function AccountStep({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const strength = passwordStrength(password);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email address.";
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
      e.password = "Use at least 8 characters with a letter and a number.";
    if (confirm !== password) e.confirm = "Passwords don't match.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create your account.");
      // Activate the wallet in the background while the user finishes setup.
      void fetch("/api/wallet/provision", { method: "POST" }).catch(() => {});
      toast.success("Account created — let's set you up!");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-muted-foreground">
        Two minutes to a savings plan that runs itself.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="ob-name">Full name</Label>
          <Input id="ob-name" placeholder="Maria Santos" value={name}
            onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-email">Email</Label>
          <Input id="ob-email" type="email" placeholder="you@example.com" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-pass">Password</Label>
          <div className="relative">
            <Input id="ob-pass" type={show ? "text" : "password"} placeholder="••••••••"
              autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password}
              className="pr-11" />
            <button type="button" onClick={() => setShow(!show)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {password && (
            <div className="space-y-1 pt-0.5">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    i < strength.score
                      ? strength.score <= 1 ? "bg-destructive"
                        : strength.score === 2 ? "bg-warning"
                        : "bg-success"
                      : "bg-secondary",
                  )} />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{strength.label}</p>
            </div>
          )}
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-confirm">Confirm password</Label>
          <Input id="ob-confirm" type={show ? "text" : "password"} placeholder="••••••••"
            autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Continue <ArrowRight className="size-4" />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Step 2 — Welcome journey                                                 */
/* ----------------------------------------------------------------------- */

function WelcomeStep({ onNext }: { onNext: () => void; onBack?: () => void }) {
  const journey = [
    { icon: Wallet, title: "Receive a remittance", desc: "USDC lands in your own Stellar wallet — no crypto knowledge needed." },
    { icon: PiggyBank, title: "Automatically save", desc: "A smart contract sets your chosen share aside before you can spend it." },
    { icon: TargetIcon, title: "Grow savings goals", desc: "Every transfer pushes your goals forward, following your plan." },
    { icon: Sparkles, title: "Get AI insights", desc: "Personal, actionable guidance based on your real numbers." },
  ];
  return (
    <div className="mx-auto w-full max-w-lg text-center">
      <h1 className="text-3xl font-bold tracking-tight">Welcome to RemitWise 👋</h1>
      <p className="mt-2 text-muted-foreground">
        RemitWise turns every remittance into long-term financial progress — automatically.
      </p>
      <div className="mt-10 space-y-2 text-left">
        {journey.map((j, i) => (
          <React.Fragment key={j.title}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12 }}
              className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <j.icon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">{j.title}</p>
                <p className="text-sm text-muted-foreground">{j.desc}</p>
              </div>
            </motion.div>
            {i < journey.length - 1 && (
              <div className="ml-9 h-3 w-px bg-border" aria-hidden />
            )}
          </React.Fragment>
        ))}
      </div>
      <Button size="lg" className="mt-10 w-full sm:w-auto sm:px-10" onClick={onNext}>
        Let&apos;s set it up <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Step 3 — Auto-save rate                                                  */
/* ----------------------------------------------------------------------- */

function RateStep({
  ratePct, setRatePct, onNext, onBack,
}: {
  ratePct: number;
  setRatePct: (n: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const saved = 500 * (ratePct / 100);
  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="text-3xl font-bold tracking-tight">Automatic savings</h1>
      <p className="mt-2 text-muted-foreground">
        How much of every incoming remittance should RemitWise save for you? You can change
        this anytime — it&apos;s enforced on-chain either way.
      </p>

      <div className="mt-8 grid grid-cols-5 gap-2">
        {RATE_PRESETS.map((p) => (
          <button key={p} onClick={() => setRatePct(p)}
            className={cn(
              "relative rounded-xl border py-3 text-sm font-semibold transition-all",
              ratePct === p
                ? "border-primary bg-primary/8 text-primary ring-2 ring-primary/25"
                : "border-border hover:border-primary/40",
            )}>
            {p}%
            {p === 20 && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-px text-[9px] font-bold text-primary-foreground">
                ★
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-right text-[11px] text-muted-foreground">★ 20% recommended</p>

      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <Label htmlFor="rate-slider">Custom rate</Label>
          <span className="text-3xl font-bold text-gradient tabular-nums">{ratePct}%</span>
        </div>
        <input id="rate-slider" type="range" min={5} max={90} step={1} value={ratePct}
          onChange={(e) => setRatePct(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
          aria-label="Auto-save percentage" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>5%</span><span>90%</span></div>
      </div>

      {/* Live preview */}
      <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Live preview — a $500 remittance
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-success/8 p-3.5">
            <p className="text-xs text-muted-foreground">Automatically saved</p>
            <p className="text-xl font-bold text-success tabular-nums">{formatCurrency(saved)}</p>
          </div>
          <div className="rounded-xl bg-primary/8 p-3.5">
            <p className="text-xs text-muted-foreground">Available to spend</p>
            <p className="text-xl font-bold text-primary tabular-nums">{formatCurrency(500 - saved)}</p>
          </div>
        </div>
      </div>

      <WizardNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Step 4 — Goals                                                           */
/* ----------------------------------------------------------------------- */

function GoalsStep({
  goals, setGoals, onNext, onBack,
}: {
  goals: DraftGoal[];
  setGoals: React.Dispatch<React.SetStateAction<DraftGoal[]>>;
  onNext: () => void;
  onBack: () => void;
}) {
  function addGoal(category: string) {
    const meta = goalMeta(category);
    setGoals((gs) => [
      ...gs,
      {
        key: `${category}-${Date.now()}`,
        name: meta.label,
        category,
        targetAmount: meta.suggestedTarget,
        targetDate: "",
        priority: category === "emergency" ? "high" : "medium",
        allocationPct: 0,
      },
    ]);
  }
  const remove = (key: string) => setGoals((gs) => gs.filter((g) => g.key !== key));
  const patch = (key: string, p: Partial<DraftGoal>) =>
    setGoals((gs) => gs.map((g) => (g.key === key ? { ...g, ...p } : g)));

  const valid = goals.every((g) => g.name.trim().length >= 2 && g.targetAmount > 0);

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-3xl font-bold tracking-tight">What are you saving for?</h1>
      <p className="mt-2 text-muted-foreground">
        Pick a few goals — your savings will fund them automatically. You can skip this and
        add goals later.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {GOAL_CATEGORIES.map((c) => {
          const Icon = c.icon;
          const used = goals.some((g) => g.category === c.value && c.value !== "custom");
          return (
            <button key={c.value} onClick={() => addGoal(c.value)} disabled={used}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all",
                used
                  ? "cursor-default border-primary/40 bg-primary/8 text-primary/60"
                  : "border-border hover:border-primary/50 hover:bg-primary/5",
              )}>
              <Icon className="size-4" style={{ color: c.color }} />
              {c.label}
              {!used && <Plus className="size-3 opacity-60" />}
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-3">
        <AnimatePresence initial={false}>
          {goals.map((g) => {
            const meta = goalMeta(g.category);
            const Icon = meta.icon;
            return (
              <motion.div key={g.key} layout
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>
                    <Icon className="size-4.5" />
                  </span>
                  <Input value={g.name} onChange={(e) => patch(g.key, { name: e.target.value })}
                    className="h-9 font-medium" aria-label="Goal name" />
                  <button onClick={() => remove(g.key)} aria-label={`Remove ${g.name}`}
                    className="text-muted-foreground/60 transition-colors hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Target amount (USDC)</Label>
                    <Input type="number" min={1} value={g.targetAmount || ""}
                      onChange={(e) => patch(g.key, { targetAmount: Number(e.target.value) })}
                      className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Target date (optional)</Label>
                    <Input type="date" value={g.targetDate}
                      onChange={(e) => patch(g.key, { targetDate: e.target.value })}
                      className="h-9" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {goals.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No goals yet — tap a category above to add one, or skip for now.
          </div>
        )}
      </div>

      <WizardNav onBack={onBack} onNext={onNext} nextLabel={goals.length === 0 ? "Skip for now" : "Continue"} nextDisabled={!valid} />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Step 5 — Priority & allocation                                           */
/* ----------------------------------------------------------------------- */

function PlanStep({
  goals, setGoals, onNext, onBack,
}: {
  goals: DraftGoal[];
  setGoals: React.Dispatch<React.SetStateAction<DraftGoal[]>>;
  onNext: () => void;
  onBack: () => void;
}) {
  // Initialize allocations once with a priority-based suggestion.
  React.useEffect(() => {
    if (goals.length > 0 && goals.every((g) => g.allocationPct === 0)) {
      const pcts = suggestAllocations(goals);
      setGoals((gs) => gs.map((g, i) => ({ ...g, allocationPct: pcts[i] ?? 0 })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = Math.round(goals.reduce((s, g) => s + g.allocationPct, 0));
  const balanced = total === 100;
  const patch = (key: string, p: Partial<DraftGoal>) =>
    setGoals((gs) => gs.map((g) => (g.key === key ? { ...g, ...p } : g)));

  function suggest() {
    const pcts = suggestAllocations(goals);
    setGoals((gs) => gs.map((g, i) => ({ ...g, allocationPct: pcts[i] ?? 0 })));
    toast.success("Suggested a plan from your priorities");
  }

  const slices = goals
    .filter((g) => g.allocationPct > 0)
    .map((g) => ({ name: g.name, value: g.allocationPct, color: goalMeta(g.category).color }));

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Your savings plan</h1>
      <p className="mt-2 text-muted-foreground">
        Set each goal&apos;s priority and its share of every saved amount. Shares must total 100%.
      </p>

      <div className="mt-6 grid gap-6 grid-cols-1 md:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          {goals.map((g) => {
            const meta = goalMeta(g.category);
            const Icon = meta.icon;
            return (
              <div key={g.key} className="rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg"
                      style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>
                      <Icon className="size-4" />
                    </span>
                    <span className="truncate font-semibold">{g.name}</span>
                  </div>
                  <div className="flex rounded-lg bg-secondary p-0.5">
                    {PRIORITIES.map((p) => (
                      <button key={p.value} onClick={() => patch(g.key, { priority: p.value })}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          g.priority === p.value
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <input type="range" min={0} max={100} step={5} value={g.allocationPct}
                    onChange={(e) => patch(g.key, { allocationPct: Number(e.target.value) })}
                    className="w-full accent-[var(--primary)]"
                    aria-label={`${g.name} allocation percentage`} />
                  <span className="w-12 text-right font-semibold tabular-nums"
                    style={{ color: meta.color }}>
                    {g.allocationPct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices.length ? slices : [{ name: "Unassigned", value: 1, color: "var(--secondary)" }]}
                  dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                  {(slices.length ? slices : [{ name: "Unassigned", value: 1, color: "var(--secondary)" }]).map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [`${v}%`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <Badge variant={balanced ? "success" : "warning"} className="tabular-nums">
            Total: {total}% {balanced ? "✓" : "→ must equal 100%"}
          </Badge>
          <Button variant="outline" size="sm" onClick={suggest}>
            <Wand2 className="size-3.5" /> Suggest for me
          </Button>
        </div>
      </div>

      <WizardNav onBack={onBack} onNext={onNext} nextDisabled={!balanced} />
      {!balanced && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Adjust the sliders (or tap “Suggest for me”) until shares total exactly 100%.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Step 6 — Review                                                          */
/* ----------------------------------------------------------------------- */

function ReviewStep({
  ratePct, goals, onEditRate, onEditGoals, onNext, onBack,
}: {
  ratePct: number;
  goals: DraftGoal[];
  onEditRate: () => void;
  onEditGoals: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  // Illustrative projection assuming ~$500/month in remittances.
  const monthlySaved = 500 * (ratePct / 100);
  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-3xl font-bold tracking-tight">Review your plan</h1>
      <p className="mt-2 text-muted-foreground">One last look — you can change all of this later.</p>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Auto-save rate</p>
            <p className="text-2xl font-bold text-gradient">{ratePct}%</p>
            <p className="text-xs text-muted-foreground">
              ≈ {formatCurrency(monthlySaved)} saved per {formatCurrency(500)} received
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onEditRate} aria-label="Edit auto-save rate">
            <Pencil className="size-3.5" /> Edit
          </Button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Savings goals ({goals.length})
            </p>
            <Button variant="ghost" size="sm" onClick={onEditGoals} aria-label="Edit goals">
              <Pencil className="size-3.5" /> Edit
            </Button>
          </div>
          {goals.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              No goals yet — your savings will pool in the vault until you add some.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {goals.map((g) => {
                const meta = goalMeta(g.category);
                const Icon = meta.icon;
                return (
                  <li key={g.key} className="flex items-center gap-3 py-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg"
                      style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(g.targetAmount)} target
                        {g.targetDate ? ` · by ${g.targetDate}` : ""}
                      </p>
                    </div>
                    <PriorityBadge priority={g.priority} />
                    <span className="w-11 text-right text-sm font-semibold tabular-nums">
                      {g.allocationPct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <WizardNav onBack={onBack} onNext={onNext} nextLabel="Finish setup" />
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: GoalPriority }) {
  return (
    <Badge
      variant={priority === "high" ? "default" : priority === "low" ? "muted" : "secondary"}
      className="capitalize"
    >
      {priority}
    </Badge>
  );
}

/* ----------------------------------------------------------------------- */
/*  Step 7 — Done                                                            */
/* ----------------------------------------------------------------------- */

function DoneStep({
  ratePct, goals, onFinished,
}: {
  ratePct: number;
  goals: DraftGoal[];
  onFinished: () => void;
}) {
  const [state, setState] = React.useState<"working" | "done" | "error">("working");
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            savingsRate: ratePct / 100,
            goals: goals.map((g) => ({
              name: g.name,
              category: g.category,
              targetAmount: g.targetAmount,
              targetDate: g.targetDate || null,
              priority: g.priority,
              allocationPct: g.allocationPct,
            })),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setState("done");
        setTimeout(onFinished, 2600);
      } catch (err) {
        setState("error");
        toast.error(err instanceof Error ? err.message : "Setup failed — please retry.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checklist = [
    "Account created",
    "Wallet ready on Stellar — no XLM needed",
    `Auto-save enabled at ${ratePct}% (on-chain)`,
    goals.length > 0 ? `${goals.length} savings goal${goals.length === 1 ? "" : "s"} created` : "Vault ready for your first goal",
    "Allocation plan configured",
  ];

  if (state === "error") {
    return (
      <div className="mx-auto w-full max-w-md text-center">
        <h1 className="text-2xl font-bold">Almost there…</h1>
        <p className="mt-2 text-muted-foreground">
          The Stellar network hiccuped while finishing your setup. Nothing is lost — just retry.
        </p>
        <Button className="mt-6" onClick={() => { ran.current = false; setState("working"); location.reload(); }}>
          Retry setup
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
      {state === "working" ? (
        <>
          <div className="grid size-16 place-items-center rounded-full brand-gradient text-primary-foreground animate-pulse-ring">
            <Loader2 className="size-7 animate-spin" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Setting everything up…</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Activating your wallet and writing your savings rate to the Stellar contract.
          </p>
        </>
      ) : (
        <>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 13 }}
            className="grid size-16 place-items-center rounded-full bg-success/15 text-success">
            <PartyPopper className="size-8" />
          </motion.div>
          <h1 className="mt-5 text-2xl font-bold">You&apos;re all set! 🎉</h1>
        </>
      )}
      <ul className="mt-7 w-full space-y-2 text-left">
        {checklist.map((item, i) => (
          <motion.li key={item}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: state === "done" || i < 2 ? 1 : 0.45, x: 0 }}
            transition={{ delay: 0.15 + i * 0.12 }}
            className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm">
            <CheckCircle2 className={cn("size-4.5 shrink-0", state === "done" ? "text-success" : "text-muted-foreground/50")} />
            {item}
          </motion.li>
        ))}
      </ul>
      {state === "done" && (
        <p className="mt-6 text-sm text-muted-foreground">Taking you to your dashboard…</p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*  Shared nav                                                               */
/* ----------------------------------------------------------------------- */

function WizardNav({
  onBack, onNext, nextLabel = "Continue", nextDisabled = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
      ) : <span />}
      <Button size="lg" onClick={onNext} disabled={nextDisabled} className="px-8">
        {nextLabel} <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

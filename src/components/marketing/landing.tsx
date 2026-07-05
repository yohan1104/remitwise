"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  PiggyBank,
  Wallet,
  Target,
  Sparkles,
  Zap,
  LineChart,
  ShieldCheck,
  Globe,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatCurrency } from "@/lib/utils";

const features = [
  {
    icon: PiggyBank,
    title: "On-Chain Savings Vault",
    desc: "A Soroban smart contract enforces the split the moment money lands — 20% retained in the vault, the rest released to you. Trustless, atomic, unstoppable.",
  },
  {
    icon: Wallet,
    title: "Real Stellar Wallet",
    desc: "Non-custodial USDC wallet on the Stellar network. Create or import in seconds, share via QR, receive money in real time.",
  },
  {
    icon: Target,
    title: "Goals That Fund Themselves",
    desc: "Emergency, education, medical, housing — every incoming transfer nudges each goal forward automatically.",
  },
  {
    icon: Sparkles,
    title: "AI Financial Coach",
    desc: "Plain-language insights on your saving, spending and forecasts — personalized to your real numbers, not generic tips.",
  },
  {
    icon: Zap,
    title: "Instant Detection",
    desc: "Payments are detected the instant they arrive, with sender, amount, memo and a live dashboard update.",
  },
  {
    icon: LineChart,
    title: "Investor-Grade Dashboard",
    desc: "Beautiful charts for savings over time, spend-vs-save and goal allocation. Know exactly where you stand.",
  },
];

const steps = [
  { n: "01", title: "Receive a remittance", desc: "USDC arrives from family or a client on Stellar." },
  { n: "02", title: "We split it instantly", desc: "20% moves to savings, the rest stays spendable." },
  { n: "03", title: "Goals move forward", desc: "Savings flow into your goals automatically." },
  { n: "04", title: "AI guides your next step", desc: "Personalized insights keep you on track." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute right-[-10%] top-[30%] h-[380px] w-[380px] rounded-full bg-accent/20 blur-[120px]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] grid-backdrop" />

      {/* Nav */}
      <header className="sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#stellar" className="transition-colors hover:text-foreground">Stellar</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
        <div>
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
            <Badge variant="outline" className="mb-5 gap-1.5 py-1 pl-1.5 pr-3">
              <span className="grid size-5 place-items-center rounded-full brand-gradient text-primary-foreground">
                <Globe className="size-3" />
              </span>
              Built on Stellar · USDC on Testnet
            </Badge>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
          >
            Every remittance,<br />a step toward{" "}
            <span className="text-gradient">financial security.</span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground"
          >
            RemitWise automatically saves part of every payment you receive and
            turns it into real progress on your goals — with AI guidance every
            step of the way. <span className="font-medium text-foreground">Send More. Save Smarter. Live Better.</span>
          </motion.p>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={3}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button asChild size="lg">
              <Link href="/register">
                Start saving free <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Try the live demo</Link>
            </Button>
          </motion.div>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={4}
            className="mt-8 flex items-center gap-6 text-sm text-muted-foreground"
          >
            <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-success" /> Non-custodial</span>
            <span className="flex items-center gap-2"><Zap className="size-4 text-primary" /> Instant detection</span>
            <span className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> AI insights</span>
          </motion.div>
        </div>

        <HeroCard />
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-5">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border/70 bg-card/60 p-6 glass sm:grid-cols-4">
          {[
            { k: "20%", v: "auto-saved per transfer" },
            { k: "3–5s", v: "to detect a payment" },
            { k: "$0", v: "hidden fees" },
            { k: "100%", v: "of goals self-funding" },
          ].map((s, i) => (
            <motion.div
              key={s.v}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              custom={i}
              className="text-center"
            >
              <div className="text-2xl font-bold text-gradient sm:text-3xl">{s.k}</div>
              <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.v}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-24">
        <SectionHeading
          eyebrow="Everything in one place"
          title="A remittance app that actually builds wealth"
          sub="Most apps just move money. RemitWise makes every transfer work harder for you."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              className="card-hover group rounded-2xl border border-border/70 bg-card p-6"
            >
              <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:brand-gradient group-hover:text-primary-foreground">
                <f.icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-8">
        <SectionHeading
          eyebrow="How it works"
          title="From payment to progress in seconds"
          sub="Four steps that happen automatically, every single time."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              custom={i}
              className="relative rounded-2xl border border-border/70 bg-card p-6"
            >
              <div className="text-3xl font-bold text-primary/25">{s.n}</div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stellar band */}
      <section id="stellar" className="mx-auto max-w-6xl px-5 py-24">
        <div className="relative overflow-hidden rounded-3xl brand-gradient p-10 text-primary-foreground sm:p-14">
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative max-w-2xl">
            <Badge className="mb-4 border-white/25 bg-white/15 text-white">Powered by Stellar</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Global money, moved in seconds — for fractions of a cent.
            </h2>
            <p className="mt-4 text-white/85">
              RemitWise runs on Stellar and USDC, so remittances settle in
              seconds at near-zero cost. The savings rule isn&apos;t enforced by our
              backend — it&apos;s a <span className="font-semibold text-white">deployed Soroban smart contract</span> that
              retains your savings on-chain and releases the rest, atomically.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90">
                <Link href="/register">
                  Create your wallet <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-muted-foreground sm:flex-row">
          <Logo size={28} />
          <p>Send More. Save Smarter. Live Better.</p>
          <p>© {new Date().getFullYear()} RemitWise · Stellar Hackathon MVP</p>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      className="mx-auto max-w-2xl text-center"
    >
      <div className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-muted-foreground">{sub}</p>
    </motion.div>
  );
}

function HeroCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-md"
    >
      <div className="animate-float-slow rounded-3xl border border-border/70 bg-card p-6 shadow-2xl shadow-primary/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Incoming remittance</div>
            <div className="mt-1 text-3xl font-bold">{formatCurrency(500)}</div>
          </div>
          <div className="grid size-11 place-items-center rounded-full bg-success/15 text-success animate-pulse-ring">
            <Zap className="size-5" />
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">from Maria Santos · USDC</div>

        <div className="my-5 h-px bg-border" />

        <div className="space-y-3">
          <SplitRow label="Auto-saved (20%)" value={100} tone="save" />
          <SplitRow label="Available to spend" value={400} tone="spend" />
        </div>

        <div className="mt-5 rounded-xl bg-primary/8 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="size-4" /> AI Insight
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            You&apos;re now <span className="font-semibold text-foreground">68%</span> toward your Emergency Fund — about 3 remittances to go.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function SplitRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "save" | "spend";
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span
          className={`size-2.5 rounded-full ${tone === "save" ? "bg-success" : "bg-primary"}`}
        />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="font-semibold">{formatCurrency(value)}</span>
    </div>
  );
}

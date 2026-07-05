"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Target,
  Wallet as WalletIcon,
  Receipt,
  Sparkles,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";
import type { PublicUser } from "@/lib/auth/service";
import { DashboardProvider, useDashboard } from "./dashboard-context";
import { StatCards } from "./stat-cards";
import {
  SavingsOverTimeChart,
  SpendVsSaveChart,
  GoalAllocationChart,
} from "./charts";
import { FinancialHealthCard } from "./health";
import { GoalsSection } from "./goals";
import { TransactionsList } from "./transactions";
import { WalletCard } from "./wallet-card";
import { InsightsPanel } from "./insights";
import { SimulateRemittanceButton } from "./simulate";
import { SavingsRateDialog } from "./savings-rate";

const NAV = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#goals", label: "Goals", icon: Target },
  { href: "#wallet", label: "Wallet", icon: WalletIcon },
  { href: "#transactions", label: "Transactions", icon: Receipt },
  { href: "#insights", label: "AI Insights", icon: Sparkles },
];

export function Dashboard({
  user,
  initialData,
}: {
  user: PublicUser;
  initialData: DashboardData;
}) {
  return (
    <DashboardProvider initialData={initialData}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <Sidebar />
        <div className="flex min-w-0 flex-col">
          <Topbar user={user} />
          <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
            <Content />
          </main>
        </div>
      </div>
    </DashboardProvider>
  );
}

function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border/70 bg-sidebar p-4 lg:flex">
      <Link href="/" className="px-2 py-2">
        <Logo size={30} />
      </Link>
      <nav className="mt-4 space-y-1">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <item.icon className="size-4.5" />
            {item.label}
          </a>
        ))}
      </nav>
      <div className="mt-auto rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-primary" /> Live on Stellar Testnet
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          “Simulate Remittance” settles a real USDC payment through the Soroban
          savings vault — every split is enforced on-chain.
        </p>
      </div>
    </aside>
  );
}

function Topbar({ user }: { user: PublicUser }) {
  const { refreshing, refresh } = useDashboard();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Signed out");
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo size={26} />
          </div>
          <div className="hidden lg:block">
            <h1 className="truncate text-lg font-semibold">
              Welcome back, {user.name.split(" ")[0]} 👋
            </h1>
            <p className="text-xs text-muted-foreground">
              Here&apos;s how your money is growing today.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            aria-label="Refresh"
            className="hidden sm:inline-flex"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <SavingsRateDialog />
          <SimulateRemittanceButton className="hidden sm:inline-flex" />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                <Avatar>
                  <AvatarFallback>{initials(user.name)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-medium text-foreground">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Mobile action bar */}
      <div className="flex items-center gap-2 border-t border-border/70 px-4 py-2 sm:hidden">
        <SimulateRemittanceButton className="flex-1" />
      </div>
    </header>
  );
}

function Section({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="scroll-mt-24"
    >
      {children}
    </motion.section>
  );
}

function ProvisionBanner() {
  const { data, refresh } = useDashboard();
  const [status, setStatus] = React.useState<"idle" | "working" | "done">("idle");

  React.useEffect(() => {
    if (data.wallet.provisioned || status !== "idle") return;
    setStatus("working");
    (async () => {
      try {
        const res = await fetch("/api/wallet/provision", { method: "POST" });
        const json = await res.json();
        if (json.trustline) {
          toast.success("Your Stellar wallet is now active");
          await refresh();
        }
      } finally {
        setStatus("done");
      }
    })();
  }, [data.wallet.provisioned, status, refresh]);

  if (data.wallet.provisioned) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
      <RefreshCw className="size-4 animate-spin text-primary" />
      <span>
        Activating your wallet on Stellar — funding via Friendbot and establishing the USDC
        trustline. This takes a few seconds…
      </span>
    </div>
  );
}

function Content() {
  return (
    <>
      <ProvisionBanner />
      <Section id="overview">
        <StatCards />
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SavingsOverTimeChart />
        </div>
        <FinancialHealthCard />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SpendVsSaveChart />
        <GoalAllocationChart />
      </div>

      <Section id="goals">
        <GoalsSection />
      </Section>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div id="transactions" className="scroll-mt-24">
          <TransactionsList />
        </div>
        <div id="wallet" className="scroll-mt-24">
          <WalletCard />
        </div>
      </div>

      <Section id="insights">
        <InsightsPanel />
      </Section>
    </>
  );
}

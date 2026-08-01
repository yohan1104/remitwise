"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Target,
  SlidersHorizontal as SlidersIcon,
  Wallet as WalletIcon,
  Receipt,
  Sparkles,
  LogOut,
  RefreshCw,
  Zap,
  History,
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
import { NotificationsBell } from "./notifications";
import { AllocationCenter } from "./allocation-center";
import { SettingsDialog } from "./settings-dialog";
import { ReceiveMoneyDialog } from "./receive-dialog";
import { SendMoneyDialog } from "@/components/payments/send-money-dialog";
import { WithdrawalsCard } from "./withdrawals-card";
import { MobileNav } from "./mobile-nav";
import { GetStartedCard } from "./get-started";

const NAV = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#goals", label: "Goals", icon: Target },
  { href: "#plan", label: "Savings Plan", icon: SlidersIcon },
  { href: "#wallet", label: "Wallet", icon: WalletIcon },
  { href: "#transactions", label: "Transactions", icon: Receipt },
  { href: "#insights", label: "AI Insights", icon: Sparkles },
  { href: "/dashboard/activity", label: "Activity & Statements", icon: History },
];

export function Dashboard({
  user,
  initialData,
  payToken,
}: {
  user: PublicUser;
  initialData: DashboardData;
  /** QR token from a deep link — opens the send flow on arrival. */
  payToken?: string | null;
}) {
  return (
    <DashboardProvider initialData={initialData}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
        <Sidebar />
        <div className="flex min-w-0 flex-col">
          <Topbar user={user} payToken={payToken} />
          <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 pb-28 sm:px-6 lg:pb-6">
            <Content userId={user.id} />
          </main>
          <MobileNav />
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
        {NAV.map((item) => {
          const cls =
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
          return item.href.startsWith("/") ? (
            <Link key={item.href} href={item.href} className={cls}>
              <item.icon className="size-4.5" />
              {item.label}
            </Link>
          ) : (
            <a key={item.href} href={item.href} className={cls}>
              <item.icon className="size-4.5" />
              {item.label}
            </a>
          );
        })}
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

function Topbar({ user, payToken }: { user: PublicUser; payToken?: string | null }) {
  const { refreshing, refresh } = useDashboard();
  const router = useRouter();
  // Consumed once, then stripped from the URL so a refresh doesn't re-open
  // the payment (and the token stops sitting in the address bar).
  const [pendingPay, setPendingPay] = React.useState<string | null>(payToken ?? null);

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
          <ReceiveMoneyDialog className="hidden xl:inline-flex" />
          <SendMoneyDialog
            className="hidden md:inline-flex"
            initialPayload={pendingPay}
            onInitialPayloadConsumed={() => {
              setPendingPay(null);
              window.history.replaceState(null, "", "/dashboard");
            }}
          />
          <SimulateRemittanceButton
            trigger={
              <Button aria-label="Simulate remittance">
                <Zap className="size-4" />
                <span className="hidden sm:inline">Simulate Remittance</span>
              </Button>
            }
          />
          <NotificationsBell />
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
              <SettingsDialog initialName={user.name} />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

  // The Get Started card owns the provisioning display for brand-new
  // accounts; this banner covers re-provisioning for established ones.
  if (data.wallet.provisioned || data.totals.remittanceCount === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
      <RefreshCw className="size-4 animate-spin text-primary" />
      <span>
        Activating your wallet on Stellar — RemitWise is sponsoring your account reserves and
        USDC trustline, so you need no XLM. This takes a few seconds…
      </span>
    </div>
  );
}

function Content({ userId }: { userId: string }) {
  return (
    <>
      <GetStartedCard userId={userId} />
      <ProvisionBanner />
      <Section id="overview">
        <StatCards />
      </Section>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SavingsOverTimeChart />
        </div>
        <FinancialHealthCard />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <SpendVsSaveChart />
        <GoalAllocationChart />
      </div>

      <Section id="goals">
        <GoalsSection />
      </Section>

      <Section id="plan">
        <AllocationCenter />
      </Section>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1fr_380px]">
        <div id="transactions" className="scroll-mt-24">
          <TransactionsList />
        </div>
        <div id="wallet" className="scroll-mt-24 space-y-6">
          <WalletCard />
          <WithdrawalsCard />
        </div>
      </div>

      <Section id="insights">
        <InsightsPanel />
      </Section>
    </>
  );
}

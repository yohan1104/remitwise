"use client";

import Link from "next/link";
import { LayoutDashboard, Receipt, ScanLine, Target, Wallet as WalletIcon } from "lucide-react";
import { SendMoneyDialog } from "@/components/payments/send-money-dialog";

const TABS = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#goals", label: "Goals", icon: Target },
  // center slot: Scan & pay
  { href: "#wallet", label: "Wallet", icon: WalletIcon },
  { href: "/dashboard/activity", label: "Activity", icon: Receipt, isRoute: true },
] as const;

function Tab({
  href,
  label,
  icon: Icon,
  isRoute,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  isRoute?: boolean;
}) {
  const className =
    "flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground";
  const content = (
    <>
      <Icon className="size-5" />
      {label}
    </>
  );
  return isRoute ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <a href={href} className={className}>
      {content}
    </a>
  );
}

/**
 * Mobile bottom tab bar — the app's primary navigation under lg. The centre
 * slot is the scanner, the position every mobile wallet puts it in and the
 * one action people reach for while standing at a counter. Receiving money is
 * one tap away in the Wallet tab.
 */
export function MobileNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1 px-3 py-1.5">
        <Tab {...TABS[0]} />
        <Tab {...TABS[1]} />
        <div className="flex flex-col items-center gap-1 py-1.5">
          <SendMoneyDialog
            trigger={
              <button
                type="button"
                aria-label="Scan a QR code and pay"
                className="grid size-12 -mt-6 place-items-center rounded-full brand-gradient text-white shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
              >
                <ScanLine className="size-5" />
              </button>
            }
          />
          <span className="text-[11px] font-medium text-muted-foreground">Scan</span>
        </div>
        <Tab {...TABS[2]} />
        <Tab {...TABS[3]} />
      </div>
    </nav>
  );
}

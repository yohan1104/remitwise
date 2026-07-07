"use client";

import * as React from "react";
import { Bell, ArrowDownLeft, Target, ArrowUpFromLine, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useDashboard } from "./dashboard-context";
import type { TransactionView } from "@/lib/types";

/**
 * Lightweight notification center derived from the transaction stream —
 * every on-chain event the user cares about, with an unread badge.
 * Read-state lives in localStorage (per-browser), so no schema changes.
 */

const SEEN_KEY = "remitwise.notifications.lastSeen";

interface Notification {
  id: string;
  icon: typeof Bell;
  color: string;
  title: string;
  body: string;
  at: string;
}

function toNotification(t: TransactionView): Notification | null {
  switch (t.type) {
    case "remittance_received":
      return {
        id: t.id,
        icon: ArrowDownLeft,
        color: "#2563eb",
        title: `Remittance received — ${formatCurrency(t.amount)}`,
        body: `${t.sender ?? "Sender"} · ${formatCurrency(t.savedAmount ?? 0)} auto-saved on-chain`,
        at: t.createdAt,
      };
    case "goal_contribution":
      return {
        id: t.id,
        icon: Target,
        color: "#059669",
        title: `Saved ${formatCurrency(t.amount)} toward a goal`,
        body: t.memo ?? "Moved to your on-chain vault",
        at: t.createdAt,
      };
    case "withdrawal":
      return {
        id: t.id,
        icon: ArrowUpFromLine,
        color: "#d97706",
        title: `Withdrew ${formatCurrency(t.amount)} from savings`,
        body: t.memo ?? "Vault → spendable balance",
        at: t.createdAt,
      };
    case "savings_allocation":
      return {
        id: t.id,
        icon: PiggyBank,
        color: "#7c3aed",
        title: `Savings updated — ${formatCurrency(t.amount)}`,
        body: t.memo ?? "",
        at: t.createdAt,
      };
    default:
      return null;
  }
}

export function NotificationsBell() {
  const { data } = useDashboard();
  const [lastSeen, setLastSeen] = React.useState<number>(() => {
    if (typeof window === "undefined") return Date.now();
    return Number(window.localStorage.getItem(SEEN_KEY) ?? 0);
  });

  const notifications = React.useMemo(
    () =>
      data.transactions
        .map(toNotification)
        .filter((n): n is Notification => n !== null)
        .slice(0, 8),
    [data.transactions],
  );

  const unread = notifications.filter((n) => new Date(n.at).getTime() > lastSeen).length;

  function markSeen(open: boolean) {
    if (!open) return;
    const now = Date.now();
    window.localStorage.setItem(SEEN_KEY, String(now));
    setLastSeen(now);
  }

  return (
    <DropdownMenu onOpenChange={markSeen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} className="relative">
          <Bell className="size-[1.15rem]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No activity yet — receive a remittance to get started.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((n) => {
              const Icon = n.icon;
              const isNew = new Date(n.at).getTime() > lastSeen;
              return (
                <div key={n.id} className="flex gap-2.5 rounded-md px-2.5 py-2.5 hover:bg-secondary/60">
                  <span
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full"
                    style={{ backgroundColor: `${n.color}1a`, color: n.color }}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                      <span className="truncate">{n.title}</span>
                      {isNew && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                    <p className="text-[11px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(n.at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

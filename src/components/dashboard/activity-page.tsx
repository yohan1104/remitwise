"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  Inbox,
  Loader2,
  Search,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/logo";
import { cn, formatCurrency } from "@/lib/utils";
import { monthLabel } from "@/lib/export";
import type { TransactionPage, TransactionView } from "@/lib/types";
import { TX_META, txSign, txTitle } from "./transaction-meta";
import { TransactionDetailDialog } from "./transaction-detail";

type FilterKey = "all" | "in" | "savings" | "payments" | "out";

const FILTERS: { key: FilterKey; label: string; types: string[] }[] = [
  { key: "all", label: "All", types: [] },
  { key: "in", label: "Received", types: ["remittance_received", "transfer_received"] },
  {
    key: "savings",
    label: "Savings",
    types: ["goal_contribution", "withdrawal", "savings_allocation"],
  },
  { key: "payments", label: "QR payments", types: ["transfer_sent", "transfer_received"] },
  { key: "out", label: "Cash-outs", types: ["cash_out"] },
];

function buildQuery(opts: {
  filter: FilterKey;
  month: string;
  q: string;
  cursor?: string;
}): string {
  const params = new URLSearchParams();
  const types = FILTERS.find((f) => f.key === opts.filter)?.types ?? [];
  if (types.length > 0) params.set("types", types.join(","));
  if (opts.month !== "all") params.set("month", opts.month);
  if (opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.cursor) params.set("cursor", opts.cursor);
  return params.toString();
}

interface DayGroup {
  label: string;
  items: TransactionView[];
}

function groupByDay(items: TransactionView[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const t of items) {
    const d = new Date(t.createdAt);
    const label = isToday(d)
      ? "Today"
      : isYesterday(d)
        ? "Yesterday"
        : format(d, "MMMM d, yyyy");
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }
  return groups;
}

export function ActivityPage({
  initialPage,
  months,
  network,
  totalCount,
}: {
  initialPage: TransactionPage;
  months: string[];
  network: string;
  totalCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // --- Filter state (initialized from the URL so views are shareable) -----
  const [filter, setFilter] = React.useState<FilterKey>(() => {
    const f = searchParams.get("filter");
    return FILTERS.some((x) => x.key === f) ? (f as FilterKey) : "all";
  });
  const [month, setMonth] = React.useState<string>(
    () => searchParams.get("month") ?? "all",
  );
  const [qInput, setQInput] = React.useState(() => searchParams.get("q") ?? "");
  const [q, setQ] = React.useState(qInput);

  // Debounce free-text search.
  React.useEffect(() => {
    const id = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  // Reflect filters in the URL (replace — no history spam).
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (month !== "all") params.set("month", month);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filter, month, q, pathname, router]);

  // --- Data ---------------------------------------------------------------
  const isDefaultView = filter === "all" && month === "all" && !q.trim();
  const [items, setItems] = React.useState<TransactionView[]>(
    initialPage.transactions,
  );
  const [nextCursor, setNextCursor] = React.useState(initialPage.nextCursor);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const firstRender = React.useRef(true);

  React.useEffect(() => {
    // The server already rendered the default view; only refetch on change.
    if (firstRender.current) {
      firstRender.current = false;
      if (isDefaultView) return;
    }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/transactions?${buildQuery({ filter, month, q })}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error();
        const page: TransactionPage = await res.json();
        setItems(page.transactions);
        setNextCursor(page.nextCursor);
      } catch {
        if (!controller.signal.aborted) {
          setItems([]);
          setNextCursor(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, month, q]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/transactions?${buildQuery({ filter, month, q, cursor: nextCursor })}`,
      );
      if (!res.ok) throw new Error();
      const page: TransactionPage = await res.json();
      setItems((prev) => [...prev, ...page.transactions]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  // --- Detail dialog ------------------------------------------------------
  const [selected, setSelected] = React.useState<TransactionView | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const exportHref = `/api/transactions/export?${buildQuery({ filter, month, q })}`;
  const groups = groupByDay(items);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Button asChild variant="ghost" size="icon" aria-label="Back to dashboard">
            <Link href="/dashboard">
              <ArrowLeft className="size-4.5" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight">Activity</h1>
            <p className="text-xs text-muted-foreground">
              {totalCount} transaction{totalCount === 1 ? "" : "s"} · every one
              verifiable on Stellar
            </p>
          </div>
          <Logo size={26} className="hidden sm:flex" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter by type"
              className="flex flex-wrap items-center gap-1.5"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    filter === f.key
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FileText className="size-4" />
                    <span className="hidden sm:inline">Statements</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
                  <DropdownMenuLabel>Monthly statements</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {months.length === 0 && (
                    <DropdownMenuItem disabled>No activity yet</DropdownMenuItem>
                  )}
                  {months.map((m) => (
                    <DropdownMenuItem key={m} asChild>
                      <Link href={`/dashboard/statement/${m}`}>{monthLabel(m)}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild variant="outline" size="sm">
                <a href={exportHref} download>
                  <Download className="size-4" />
                  <span className="hidden sm:inline">Export CSV</span>
                </a>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-52">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search sender or reference…"
                aria-label="Search transactions"
                className="pl-9"
              />
            </div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-44" aria-label="Filter by month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        <div className="mt-6">
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading activity">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
                <Inbox className="size-5" />
              </div>
              <div>
                <p className="font-medium">Nothing here</p>
                <p className="text-sm text-muted-foreground">
                  {isDefaultView
                    ? "Your transactions will appear here as money moves."
                    : "No transactions match these filters."}
                </p>
              </div>
            </div>
          ) : (
            <>
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h2 className="sticky top-[57px] z-10 -mx-4 bg-background/95 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur sm:-mx-6 sm:px-6">
                    {g.label}
                  </h2>
                  <ul className="divide-y divide-border/70">
                    {g.items.map((t) => {
                      const meta = TX_META[t.type];
                      const Icon = meta.icon;
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(t);
                              setDetailOpen(true);
                            }}
                            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-secondary/50"
                          >
                            <span
                              className="grid size-10 shrink-0 place-items-center rounded-full"
                              style={{
                                backgroundColor: `${meta.color}1a`,
                                color: meta.color,
                              }}
                            >
                              <Icon className="size-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate font-medium">{txTitle(t)}</span>
                                {t.type === "remittance_received" &&
                                  t.savedAmount != null && (
                                    <Badge
                                      variant="success"
                                      className="hidden sm:inline-flex"
                                    >
                                      +{formatCurrency(t.savedAmount)} saved
                                    </Badge>
                                  )}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {meta.label}
                                {t.memo ? ` · ${t.memo}` : ""} ·{" "}
                                {format(new Date(t.createdAt), "h:mm a")}
                              </span>
                            </span>
                            <span className="text-right">
                              <span className="block font-semibold tabular-nums">
                                {txSign(t)}
                                {formatCurrency(t.amount)}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {t.status === "pending" ? (
                                  <span className="text-warning">pending</span>
                                ) : t.status === "failed" ? (
                                  <span className="text-destructive">failed</span>
                                ) : (
                                  t.asset
                                )}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}

              {nextCursor && (
                <div className="flex justify-center py-6">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore && <Loader2 className="size-4 animate-spin" />}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <TransactionDetailDialog
        tx={selected}
        network={network}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

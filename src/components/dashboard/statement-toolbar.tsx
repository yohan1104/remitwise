"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Screen-only controls above the printable statement document. */
export function StatementToolbar({ month }: { month: string }) {
  return (
    <div className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/activity">
            <ArrowLeft className="size-4" /> Activity
          </Link>
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/transactions/export?month=${month}`} download>
              <Download className="size-4" />
              <span className="hidden sm:inline">CSV</span>
            </a>
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print / Save as PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

import { NextResponse } from "next/server";
import { authed, fail } from "@/lib/api";
import { listTransactionsForExport } from "@/lib/dashboard/transactions";
import { buildTransactionsCsv } from "@/lib/export";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { parseListQuery } from "../query";

/** Download the user's activity as CSV (filters mirror the list endpoint). */
export async function GET(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const opts = parseListQuery(req.url);
  if (!opts) return fail("Invalid query.");
  try {
    const [rows, wallet] = await Promise.all([
      listTransactionsForExport(guard.id, opts),
      prisma.wallet.findUniqueOrThrow({ where: { userId: guard.id } }),
    ]);
    const csv = buildTransactionsCsv(rows, wallet.network);
    await audit({ action: "activity.export", userId: guard.id, detail: `${rows.length} rows` });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="remitwise-activity-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return fail("Could not export activity.", 500);
  }
}

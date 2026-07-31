import { NextResponse } from "next/server";
import { authed, ok, fail } from "@/lib/api";
import { listTransactions } from "@/lib/dashboard/transactions";
import { parseListQuery } from "./query";

/** Paginated activity feed with type/date/search filters. */
export async function GET(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const opts = parseListQuery(req.url);
  if (!opts) return fail("Invalid query.");
  try {
    return ok(await listTransactions(guard.id, opts));
  } catch (err) {
    console.error(err);
    return fail("Could not load transactions.", 500);
  }
}

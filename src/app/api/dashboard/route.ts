import { authed, ok, fail } from "@/lib/api";
import { getDashboardData } from "@/lib/dashboard/service";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  try {
    const includeOnChain =
      new URL(req.url).searchParams.get("onchain") === "1";
    const data = await getDashboardData(guard.id, { includeOnChain });
    return ok(data);
  } catch (err) {
    console.error(err);
    return fail("Could not load dashboard.", 500);
  }
}

import { authed, ok, fail } from "@/lib/api";
import { getDashboardData } from "@/lib/dashboard/service";
import { generateInsights } from "@/lib/ai/service";
import { NextResponse } from "next/server";

export async function GET() {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  try {
    const data = await getDashboardData(guard.id);
    const insights = await generateInsights(data);
    return ok({ insights });
  } catch (err) {
    console.error(err);
    return fail("Could not generate insights.", 500);
  }
}

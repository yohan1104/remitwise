import { NextResponse } from "next/server";
import { getCurrentUser, type PublicUser } from "@/lib/auth/service";
import { rateLimit } from "@/lib/rate-limit";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Guard for API route handlers. Returns the user or a 401/429 response.
 * Pass `"financial"` for routes that mutate money — they get a tighter
 * per-user limit on top of the general per-IP one.
 * Usage:
 *   const guard = await authed();
 *   if (guard instanceof NextResponse) return guard;
 *   const user = guard;
 */
export async function authed(
  bucket?: "financial",
): Promise<PublicUser | NextResponse> {
  const limited = await rateLimit("general");
  if (limited) return limited;
  const user = await getCurrentUser();
  if (!user) return fail("Not authenticated.", 401);
  if (bucket === "financial") {
    const fin = await rateLimit("financial", user.id);
    if (fin) return fin;
  }
  return user;
}

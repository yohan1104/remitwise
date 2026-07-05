import { NextResponse } from "next/server";
import { getCurrentUser, type PublicUser } from "@/lib/auth/service";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Guard for API route handlers. Returns the user or a 401 response.
 * Usage:
 *   const guard = await authed();
 *   if (guard instanceof NextResponse) return guard;
 *   const user = guard;
 */
export async function authed(): Promise<PublicUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return fail("Not authenticated.", 401);
  return user;
}

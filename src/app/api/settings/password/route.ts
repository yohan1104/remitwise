import { NextResponse } from "next/server";
import { authed, ok, fail } from "@/lib/api";
import { passwordChangeSchema } from "@/lib/validation";
import { changePassword } from "@/lib/auth/service";
import { AuthError } from "@/lib/auth/service";

/** Change password — verified against the current one, tightly rate-limited. */
export async function POST(req: Request) {
  const guard = await authed("financial");
  if (guard instanceof NextResponse) return guard;

  const parsed = passwordChangeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");

  try {
    await changePassword(guard.id, parsed.data);
    return ok({ success: true });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, 403);
    console.error(err);
    return fail("Could not change password.", 500);
  }
}

import { loginUser, AuthError } from "@/lib/auth/service";
import { loginSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const parsed = loginSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }
    const user = await loginUser(parsed.data);
    return ok({ user });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, 401);
    console.error(err);
    return fail("Could not sign you in. Please try again.", 500);
  }
}

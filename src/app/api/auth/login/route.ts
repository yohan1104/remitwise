import { rateLimit } from "@/lib/rate-limit";
import { loginUser, AuthError } from "@/lib/auth/service";
import { loginSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const limited = await rateLimit("auth");
  if (limited) return limited;
  try {
    const parsed = loginSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }
    const user = await loginUser(parsed.data);
    await audit({ action: "auth.login", userId: user.id });
    return ok({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      await audit({ action: "auth.login_failed", detail: "invalid credentials" });
      return fail(err.message, 401);
    }
    console.error(err);
    return fail("Could not sign you in. Please try again.", 500);
  }
}

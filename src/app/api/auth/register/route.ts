import { registerUser, AuthError } from "@/lib/auth/service";
import { registerSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const parsed = registerSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
    }
    const user = await registerUser(parsed.data);
    return ok({ user });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, 409);
    console.error(err);
    return fail("Could not create your account. Please try again.", 500);
  }
}

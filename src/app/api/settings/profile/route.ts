import { authed, ok, fail } from "@/lib/api";
import { profileSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const parsed = profileSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid profile.");
  }
  const user = await prisma.user.update({
    where: { id: guard.id },
    data: { name: parsed.data.name.trim() },
  });
  return ok({ name: user.name });
}

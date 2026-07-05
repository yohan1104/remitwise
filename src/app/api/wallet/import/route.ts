import { authed, ok, fail } from "@/lib/api";
import { importWalletSchema } from "@/lib/validation";
import { importWalletForUser } from "@/lib/stellar/service";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const guard = await authed();
  if (guard instanceof NextResponse) return guard;
  const parsed = importWalletSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid secret key.");
  }
  try {
    const wallet = await importWalletForUser(guard.id, parsed.data.secret);
    return ok({ publicKey: wallet.publicKey });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Import failed.");
  }
}

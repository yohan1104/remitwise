import { logoutUser } from "@/lib/auth/service";
import { ok } from "@/lib/api";

export async function POST() {
  await logoutUser();
  return ok({ success: true });
}

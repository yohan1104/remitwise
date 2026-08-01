import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";

export const metadata = { title: "Pay with RemitWise" };
export const dynamic = "force-dynamic";

/**
 * Deep link behind every RemitWise QR code.
 *
 * A phone's built-in camera app can't open a dialog inside RemitWise, but it
 * can open a URL — so the QR encodes this route, which hands the token to the
 * dashboard's send flow (signing in first when needed). Nothing is validated
 * or charged here; /api/payments/qr/resolve remains the only authority.
 */
export default async function QrDeepLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const target = `/dashboard?pay=${encodeURIComponent(token)}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(target)}`);
  redirect(target);
}

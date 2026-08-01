import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { getDashboardData } from "@/lib/dashboard/service";
import { createWalletForUser } from "@/lib/stellar/service";
import { prisma } from "@/lib/prisma";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata = { title: "Dashboard · RemitWise" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ pay?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Finish guided setup before the dashboard (new accounts only).
  if (!user.onboarded) redirect("/onboarding");

  // Safety net: guarantee the user has a wallet before loading the dashboard.
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  if (!wallet) await createWalletForUser(user.id);

  const [initialData, { pay }] = await Promise.all([
    getDashboardData(user.id, { includeOnChain: true }),
    searchParams,
  ]);

  // Set by /qr/<token>: open the send flow on this scanned code.
  return <Dashboard user={user} initialData={initialData} payToken={pay ?? null} />;
}

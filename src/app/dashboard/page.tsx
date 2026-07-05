import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { getDashboardData } from "@/lib/dashboard/service";
import { createWalletForUser } from "@/lib/stellar/service";
import { prisma } from "@/lib/prisma";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata = { title: "Dashboard · RemitWise" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Safety net: guarantee the user has a wallet before loading the dashboard.
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  if (!wallet) await createWalletForUser(user.id);

  const initialData = await getDashboardData(user.id, { includeOnChain: true });

  return <Dashboard user={user} initialData={initialData} />;
}

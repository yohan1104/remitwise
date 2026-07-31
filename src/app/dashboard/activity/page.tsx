import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { prisma } from "@/lib/prisma";
import {
  countTransactions,
  listActivityMonths,
  listTransactions,
} from "@/lib/dashboard/transactions";
import { ActivityPage } from "@/components/dashboard/activity-page";

export const metadata = { title: "Activity · RemitWise" };
export const dynamic = "force-dynamic";

export default async function Activity() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [initialPage, months, totalCount, wallet] = await Promise.all([
    listTransactions(user.id),
    listActivityMonths(user.id),
    countTransactions(user.id),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <ActivityPage
      initialPage={initialPage}
      months={months}
      network={wallet?.network ?? "testnet"}
      totalCount={totalCount}
    />
  );
}

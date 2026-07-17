import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDepositForSender } from "@/lib/payouts/deposits";
import { SenderCheckout } from "./sender-checkout";

export const metadata: Metadata = {
  title: "Complete your transfer — RemitWise",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Sender-facing interactive payment page (SEP-24 "interactive URL").
 *
 * With the mock anchor this page plays the anchor's hosted checkout: the
 * sender abroad opens the link the recipient shared, sees the locked quote,
 * and confirms a bank payment. A real SEP-24 partner replaces this page with
 * its own hosted flow — nothing else in the app changes.
 *
 * Public by design; the unguessable intent id is the capability and the
 * projection excludes anything sensitive (no email, wallet, or balances).
 */
export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deposit = await getDepositForSender(id);
  if (!deposit) notFound();
  const { getStellarConfig } = await import("@/lib/stellar/config");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary/30 px-4 py-10">
      <SenderCheckout initial={deposit} network={getStellarConfig().network} />
    </main>
  );
}

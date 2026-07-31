import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { buildStatement } from "@/lib/dashboard/transactions";
import { isMonthKey, TX_TYPE_LABELS } from "@/lib/export";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";
import { StatementToolbar } from "@/components/dashboard/statement-toolbar";
import type { TransactionView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month } = await params;
  return { title: `Statement ${month} · RemitWise` };
}

/**
 * Printable monthly statement — a clean, always-light document (independent
 * of app theme) that doubles as verifiable proof of remittance income:
 * every settled line carries a public Stellar transaction hash.
 */
export default async function StatementPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month } = await params;
  if (!isMonthKey(month)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await buildStatement(user.id, month);
  const s = data.summary;
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(iso),
    );
  const shortHash = (h: string | null) =>
    h ? `${h.slice(0, 6)}…${h.slice(-6)}` : "—";
  const generated = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(data.generatedAt));

  return (
    <div className="min-h-dvh bg-muted/30 print:bg-white">
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      <StatementToolbar month={month} />

      <main className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
        {/* The paper — hardcoded light palette so it prints and reads like a document. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          {/* Letterhead */}
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-6">
            <div className="flex items-center gap-3">
              <LogoMark size={44} />
              <div>
                <div className="text-xl font-bold tracking-tight">RemitWise</div>
                <div className="text-xs text-slate-500">
                  Remittance &amp; savings on Stellar
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                Monthly statement
              </div>
              <div className="text-2xl font-bold">{data.label}</div>
              <div className="mt-1 text-xs text-slate-500">
                Generated {generated}
              </div>
            </div>
          </header>

          {/* Account */}
          <section className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Account holder
              </div>
              <div className="mt-1 font-semibold">{data.user.name}</div>
              <div className="text-slate-600">{data.user.email}</div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Stellar account ({data.wallet.network})
              </div>
              <div className="mt-1 break-all font-mono text-xs text-slate-700">
                {data.wallet.publicKey}
              </div>
            </div>
          </section>

          {/* Summary */}
          <section className="mt-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Remittances received</div>
                <div className="mt-1 text-xl font-bold tabular-nums">
                  {formatCurrency(s.totalReceived)}
                </div>
                <div className="text-xs text-slate-500">
                  {s.remittanceCount} payment{s.remittanceCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Auto-saved</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
                  {formatCurrency(s.totalSaved)}
                </div>
                <div className="text-xs text-slate-500">
                  {s.totalReceived > 0
                    ? `${formatPercent(s.effectiveRate)} of received`
                    : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Made spendable</div>
                <div className="mt-1 text-xl font-bold tabular-nums">
                  {formatCurrency(s.totalSpendable)}
                </div>
                <div className="text-xs text-slate-500">after auto-save</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Cashed out</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-amber-700">
                  {formatCurrency(s.cashOutTotal)}
                </div>
                <div className="text-xs text-slate-500">
                  {s.cashOutCount} transfer{s.cashOutCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Amounts are in USDC (Circle&apos;s USD-backed stablecoin). Peso
              reference: {formatCurrency(s.totalReceived)} ≈ ₱
              {Math.round(s.totalReceived * data.fx.usdPhp).toLocaleString("en-PH")}{" "}
              at ₱{data.fx.usdPhp.toFixed(2)}/USD (
              {data.fx.source === "reflector"
                ? "live Reflector oracle rate"
                : "reference rate"}{" "}
              at generation time; informational only).
            </p>
          </section>

          {/* Remittances table */}
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wide">
              Remittances received
            </h2>
            {data.remittances.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No remittances were received in this period.
              </p>
            ) : (
              <table className="mt-2 w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-slate-500">
                    <th className="py-2 pr-2 font-semibold">Date</th>
                    <th className="py-2 pr-2 font-semibold">From</th>
                    <th className="hidden py-2 pr-2 font-semibold sm:table-cell print:table-cell">
                      Reference
                    </th>
                    <th className="py-2 pr-2 text-right font-semibold">Amount</th>
                    <th className="py-2 pr-2 text-right font-semibold">Saved</th>
                    <th className="py-2 pr-2 text-right font-semibold">Spendable</th>
                    <th className="py-2 text-right font-semibold">Stellar tx</th>
                  </tr>
                </thead>
                <tbody>
                  {data.remittances.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-slate-100 [break-inside:avoid]"
                    >
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {fmtDate(t.createdAt)}
                      </td>
                      <td className="max-w-36 truncate py-2 pr-2 font-medium">
                        {t.sender ?? "—"}
                      </td>
                      <td className="hidden max-w-40 truncate py-2 pr-2 text-slate-600 sm:table-cell print:table-cell">
                        {t.memo ?? "—"}
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-emerald-700">
                        {t.savedAmount != null ? formatCurrency(t.savedAmount) : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {t.availableAmount != null
                          ? formatCurrency(t.availableAmount)
                          : "—"}
                      </td>
                      <td
                        className="py-2 text-right font-mono text-[10px] text-slate-500"
                        title={t.stellarTxId ?? undefined}
                      >
                        {shortHash(t.stellarTxId)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-2" colSpan={2}>
                      Total
                    </td>
                    <td className="hidden sm:table-cell print:table-cell" />
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {formatCurrency(s.totalReceived)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-emerald-700">
                      {formatCurrency(s.totalSaved)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {formatCurrency(s.totalSpendable)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          {/* Other activity */}
          {data.other.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wide">
                Savings &amp; transfers
              </h2>
              <table className="mt-2 w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-slate-500">
                    <th className="py-2 pr-2 font-semibold">Date</th>
                    <th className="py-2 pr-2 font-semibold">Description</th>
                    <th className="py-2 pr-2 font-semibold">Status</th>
                    <th className="py-2 pr-2 text-right font-semibold">Amount</th>
                    <th className="py-2 text-right font-semibold">Stellar tx</th>
                  </tr>
                </thead>
                <tbody>
                  {data.other.map((t: TransactionView) => (
                    <tr
                      key={t.id}
                      className="border-b border-slate-100 [break-inside:avoid]"
                    >
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {fmtDate(t.createdAt)}
                      </td>
                      <td className="py-2 pr-2">
                        <span className="font-medium">
                          {TX_TYPE_LABELS[t.type] ?? t.type}
                        </span>
                        {t.memo && (
                          <span className="text-slate-500"> — {t.memo}</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 capitalize text-slate-600">
                        {t.status}
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums">
                        {formatCurrency(t.amount)}
                      </td>
                      <td
                        className="py-2 text-right font-mono text-[10px] text-slate-500"
                        title={t.stellarTxId ?? undefined}
                      >
                        {shortHash(t.stellarTxId)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Verification footer */}
          <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500">
            <p>
              <span className="font-semibold text-slate-700">
                Independently verifiable.
              </span>{" "}
              Every settled line item above references a transaction on the
              public Stellar ledger ({data.wallet.network}). Verify any entry at{" "}
              <span className="font-mono">
                stellar.expert/explorer/{data.wallet.network}/tx/&lt;hash&gt;
              </span>
              . Auto-save splits are enforced by the RemitWise savings-vault
              smart contract{" "}
              <span className="break-all font-mono">
                {data.chain.vaultContractId}
              </span>
              .
            </p>
            <p className="mt-2">
              Generated by RemitWise from its transaction records. This document
              summarizes activity for {data.label} and is not a bank statement.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}

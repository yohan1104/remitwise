/**
 * Sender-side fiat currencies supported for on-ramp deposits.
 *
 * Rates here are labelled reference rates used for quoting when the on-chain
 * oracle has no feed for a pair (testnet). In production the SEP-24 anchor is
 * the source of truth for the executed rate — the quote is an estimate, and
 * the settled USDC amount comes from the anchor's completed transaction.
 * Client-import-safe: static data only.
 */

export interface SenderCurrency {
  code: string; // ISO-4217
  name: string;
  symbol: string;
  /** USD per 1 unit of this currency (labelled reference). */
  usdPerUnit: number;
  /** Corridors where senders commonly remit from, for display. */
  region: string;
}

export const SENDER_CURRENCIES: SenderCurrency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", usdPerUnit: 1, region: "United States" },
  { code: "EUR", name: "Euro", symbol: "€", usdPerUnit: 1.08, region: "Europe" },
  { code: "GBP", name: "British Pound", symbol: "£", usdPerUnit: 1.27, region: "United Kingdom" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", usdPerUnit: 0.74, region: "Singapore" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", usdPerUnit: 0.2723, region: "United Arab Emirates" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", usdPerUnit: 0.0064, region: "Japan" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", usdPerUnit: 0.65, region: "Australia" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", usdPerUnit: 0.72, region: "Canada" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", usdPerUnit: 0.128, region: "Hong Kong" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", usdPerUnit: 0.2666, region: "Saudi Arabia" },
];

export function findSenderCurrency(code: string): SenderCurrency | null {
  return SENDER_CURRENCIES.find((c) => c.code === code) ?? null;
}

/** Format an amount in a sender currency, e.g. "€1,250.00" / "¥50,000". */
export function formatFiat(amount: number, code: string): string {
  const c = findSenderCurrency(code);
  const digits = code === "JPY" ? 0 : 2;
  const num = amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${c?.symbol ?? ""}${num}`;
}

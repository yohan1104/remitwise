/**
 * Payout rails registry — where recipients can cash out, per country.
 *
 * Phase 2 ships the Philippines (banks + e-wallets). Adding a corridor is a
 * data change here plus an anchor that supports it — no engine or UI changes.
 * This file is import-safe on the client (static data only, no secrets).
 */

export type RailKind = "bank" | "ewallet";

export interface PayoutRail {
  /** Stable id used in APIs and stored on withdrawals, e.g. "ph_bdo". */
  code: string;
  name: string;
  kind: RailKind;
  /** Regex the account number must match (post digit-stripping). */
  accountPattern: RegExp;
  /** Shown under the account field, e.g. "10–12 digit account number". */
  accountHint: string;
  /** Human payout ETA for this rail. */
  eta: string;
}

export interface PayoutCorridor {
  countryCode: string; // ISO-3166 alpha-2
  countryName: string;
  currency: string; // ISO-4217
  currencySymbol: string;
  rails: PayoutRail[];
}

const PH_BANK = {
  kind: "bank" as const,
  accountPattern: /^\d{10,16}$/,
  accountHint: "10–16 digit account number",
  eta: "Within 1 banking day",
};

const PH_EWALLET = {
  kind: "ewallet" as const,
  accountPattern: /^09\d{9}$/,
  accountHint: "11-digit mobile number (09…)",
  eta: "Under 30 minutes",
};

export const PH_CORRIDOR: PayoutCorridor = {
  countryCode: "PH",
  countryName: "Philippines",
  currency: "PHP",
  currencySymbol: "₱",
  rails: [
    { code: "ph_bdo", name: "BDO Unibank", ...PH_BANK },
    { code: "ph_bpi", name: "BPI", ...PH_BANK },
    { code: "ph_metrobank", name: "Metrobank", ...PH_BANK },
    { code: "ph_landbank", name: "Landbank", ...PH_BANK },
    { code: "ph_pnb", name: "Philippine National Bank", ...PH_BANK },
    { code: "ph_securitybank", name: "Security Bank", ...PH_BANK },
    { code: "ph_unionbank", name: "UnionBank", ...PH_BANK },
    { code: "ph_rcbc", name: "RCBC", ...PH_BANK },
    { code: "ph_chinabank", name: "China Bank", ...PH_BANK },
    { code: "ph_eastwest", name: "EastWest Bank", ...PH_BANK },
    { code: "ph_gcash", name: "GCash", ...PH_EWALLET },
    { code: "ph_maya", name: "Maya", ...PH_EWALLET },
  ],
};

/** Corridors recipients can withdraw to. Phase 2: Philippines only. */
export const PAYOUT_CORRIDORS: PayoutCorridor[] = [PH_CORRIDOR];

export function findRail(code: string): { corridor: PayoutCorridor; rail: PayoutRail } | null {
  for (const corridor of PAYOUT_CORRIDORS) {
    const rail = corridor.rails.find((r) => r.code === code);
    if (rail) return { corridor, rail };
  }
  return null;
}

/** Normalize user input ("0917 123 4567" → "09171234567") before validating. */
export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/** Mask an account number for display: last 4 visible. */
export function maskAccountNumber(n: string): string {
  return n.length <= 4 ? n : `•••• ${n.slice(-4)}`;
}

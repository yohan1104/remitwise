import "server-only";
import { Asset, type Horizon } from "@stellar/stellar-sdk";

/**
 * Production asset registry and validation.
 *
 * RemitWise moves value in USDC. On mainnet that MUST be Circle-issued USDC —
 * a look-alike asset with the same code but a different issuer is worthless,
 * so the app refuses to start against an unknown mainnet issuer. On testnet,
 * both Circle's testnet USDC and the app-issued dev asset (from
 * `stellar:bootstrap`) are acceptable, with a logged notice for the latter.
 */

export interface KnownAsset {
  code: string;
  issuer: string;
  homeDomain: string;
  description: string;
}

export const KNOWN_USDC: Record<"testnet" | "public", KnownAsset> = {
  testnet: {
    code: "USDC",
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    homeDomain: "circle.com",
    description: "Circle USDC (Stellar testnet)",
  },
  public: {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    homeDomain: "circle.com",
    description: "Circle USDC (Stellar mainnet)",
  },
};

export interface AssetValidation {
  network: "testnet" | "public";
  code: string;
  issuer: string;
  /** True when the configured asset is the canonical Circle issuance. */
  isCircleIssued: boolean;
  notice?: string;
}

/**
 * Validate the configured asset for the active network. Throws on mainnet
 * with a non-Circle issuer unless ALLOW_UNKNOWN_ASSET=1 is set explicitly
 * (escape hatch for private deployments that know what they're doing).
 */
export function validateConfiguredAsset(cfg: {
  network: "testnet" | "public";
  usdc: { code: string; issuer: string };
}): AssetValidation {
  const known = KNOWN_USDC[cfg.network];
  const isCircleIssued =
    cfg.usdc.code === known.code && cfg.usdc.issuer === known.issuer;

  if (cfg.network === "public" && !isCircleIssued && process.env.ALLOW_UNKNOWN_ASSET !== "1") {
    throw new Error(
      `Refusing to run on mainnet with non-Circle USDC (issuer ${cfg.usdc.issuer}). ` +
        `Expected ${known.issuer}. Set ALLOW_UNKNOWN_ASSET=1 only if this is intentional.`,
    );
  }

  return {
    network: cfg.network,
    code: cfg.usdc.code,
    issuer: cfg.usdc.issuer,
    isCircleIssued,
    notice: isCircleIssued
      ? undefined
      : `Using a non-Circle ${cfg.usdc.code} issuance (${cfg.network}). Fine for development; ` +
        `mainnet requires ${known.description}.`,
  };
}

/** The Soroban contract id (SAC) for a classic asset on a given network. */
export function assetContractId(code: string, issuer: string, networkPassphrase: string): string {
  return new Asset(code, issuer).contractId(networkPassphrase);
}

export interface TrustlineCheck {
  exists: boolean;
  authorized: boolean;
  /** Remaining capacity the account can still receive of this asset. */
  headroom: number;
}

/**
 * Verify a destination account can actually receive `amount` of the asset
 * BEFORE we move funds — a payment to an account without a trustline (or with
 * an exhausted limit) would bounce and strand the withdrawal mid-flight.
 */
export async function verifyTrustline(
  horizon: Horizon.Server,
  accountId: string,
  code: string,
  issuer: string,
): Promise<TrustlineCheck> {
  try {
    const account = await horizon.loadAccount(accountId);
    const line = account.balances.find(
      (b) => "asset_code" in b && b.asset_code === code && b.asset_issuer === issuer,
    );
    if (!line || !("limit" in line)) return { exists: false, authorized: false, headroom: 0 };
    const authorized = !("is_authorized" in line) || line.is_authorized !== false;
    const headroom = Number(line.limit) - Number(line.balance);
    return { exists: true, authorized, headroom };
  } catch {
    return { exists: false, authorized: false, headroom: 0 };
  }
}

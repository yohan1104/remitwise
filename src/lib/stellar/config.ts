import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Networks } from "@stellar/stellar-sdk";

/**
 * RemitWise on-chain configuration — the deployed Soroban vault, the USDC
 * asset/SAC, and the treasury that funds simulated remittances. Produced once
 * by `npm run stellar:bootstrap` and read here at runtime.
 *
 * Values can also come from environment variables (preferred for production),
 * falling back to the generated `stellar.config.json` for local dev.
 */
export interface StellarConfig {
  network: "testnet" | "public";
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  usdc: { code: string; issuer: string };
  sacContractId: string;
  vaultContractId: string;
  distributor: { publicKey: string; secret: string };
  deployer: { publicKey: string; secret: string };
}

const CONFIG_PATH = path.join(process.cwd(), "stellar.config.json");

let cached: StellarConfig | null = null;

export function getStellarConfig(): StellarConfig {
  if (cached) return cached;

  // 1) Environment (production)
  if (process.env.STELLAR_VAULT_CONTRACT_ID && process.env.STELLAR_DISTRIBUTOR_SECRET) {
    cached = {
      network: (process.env.STELLAR_NETWORK as "testnet" | "public") ?? "testnet",
      horizonUrl: process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
      sorobanRpcUrl: process.env.STELLAR_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
      networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET,
      usdc: {
        code: process.env.STELLAR_USDC_CODE ?? "USDC",
        issuer: process.env.STELLAR_USDC_ISSUER!,
      },
      sacContractId: process.env.STELLAR_SAC_CONTRACT_ID!,
      vaultContractId: process.env.STELLAR_VAULT_CONTRACT_ID,
      distributor: {
        publicKey: process.env.STELLAR_DISTRIBUTOR_PUBLIC!,
        secret: process.env.STELLAR_DISTRIBUTOR_SECRET,
      },
      deployer: {
        publicKey: process.env.STELLAR_DEPLOYER_PUBLIC ?? "",
        secret: process.env.STELLAR_DEPLOYER_SECRET ?? "",
      },
    };
    return cached;
  }

  // 2) Generated config file (local dev)
  if (fs.existsSync(CONFIG_PATH)) {
    cached = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as StellarConfig;
    return cached;
  }

  throw new Error(
    "Stellar config not found. Run `npm run stellar:bootstrap` to deploy the " +
      "Soroban vault + USDC asset and generate stellar.config.json.",
  );
}

/** True when on-chain infra is configured — lets features degrade gracefully. */
export function isStellarConfigured(): boolean {
  try {
    getStellarConfig();
    return true;
  } catch {
    return false;
  }
}

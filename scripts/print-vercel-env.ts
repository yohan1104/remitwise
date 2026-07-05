/**
 * Prints the environment variables to paste into Vercel, derived from the
 * locally-generated stellar.config.json. Run: npm run stellar:env
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const p = path.join(process.cwd(), "stellar.config.json");
if (!fs.existsSync(p)) {
  console.error("stellar.config.json not found — run `npm run stellar:bootstrap` first.");
  process.exit(1);
}
const c = JSON.parse(fs.readFileSync(p, "utf8"));
const authSecret = crypto.randomBytes(32).toString("hex");

const lines = [
  `AUTH_SECRET=${authSecret}`,
  `WALLET_ENCRYPTION_KEY=${crypto.randomBytes(32).toString("hex")}`,
  `STELLAR_NETWORK=${c.network}`,
  `STELLAR_HORIZON_URL=${c.horizonUrl}`,
  `STELLAR_SOROBAN_RPC_URL=${c.sorobanRpcUrl}`,
  `STELLAR_NETWORK_PASSPHRASE=${c.networkPassphrase}`,
  `STELLAR_USDC_CODE=${c.usdc.code}`,
  `STELLAR_USDC_ISSUER=${c.usdc.issuer}`,
  `STELLAR_SAC_CONTRACT_ID=${c.sacContractId}`,
  `STELLAR_VAULT_CONTRACT_ID=${c.vaultContractId}`,
  `STELLAR_DISTRIBUTOR_PUBLIC=${c.distributor.publicKey}`,
  `STELLAR_DISTRIBUTOR_SECRET=${c.distributor.secret}`,
];

console.log("\n# ---- Paste these into Vercel → Settings → Environment Variables ----");
console.log("# (also add DATABASE_URL + DIRECT_URL from Supabase, see docs/DEPLOYMENT.md)\n");
console.log(lines.join("\n"));
console.log("\n# Note: WALLET_ENCRYPTION_KEY here is NEW — if you already seeded a prod DB,");
console.log("# keep the key you used at seed time so existing wallet secrets still decrypt.\n");

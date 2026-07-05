/**
 * Prints the COMPLETE set of environment variables to paste into Vercel,
 * derived from your local .env + stellar.config.json. Run: npm run stellar:env
 *
 * It reuses the exact AUTH_SECRET / WALLET_ENCRYPTION_KEY from your .env so the
 * seeded demo account's login and encrypted wallet keep working in the cloud.
 */
import fs from "node:fs";
import path from "node:path";

function readEnv(): Record<string, string> {
  const p = path.join(process.cwd(), ".env");
  const out: Record<string, string> = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const e = readEnv();
const cfgPath = path.join(process.cwd(), "stellar.config.json");
if (!fs.existsSync(cfgPath)) {
  console.error("stellar.config.json not found — run `npm run stellar:bootstrap` first.");
  process.exit(1);
}
const c = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

// The key used to encrypt wallet secrets at seed time = WALLET_ENCRYPTION_KEY or AUTH_SECRET.
const walletKey = e.WALLET_ENCRYPTION_KEY || e.AUTH_SECRET || "";
const authSecret = e.AUTH_SECRET || "";

const lines = [
  `DATABASE_URL=${e.DATABASE_URL ?? "<your-supabase-6543-pooler-url>"}`,
  `DIRECT_URL=${e.DIRECT_URL ?? "<your-supabase-5432-direct-url>"}`,
  `AUTH_SECRET=${authSecret}`,
  `WALLET_ENCRYPTION_KEY=${walletKey}`,
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

console.log("\n# ===== Paste ALL of these into Vercel → Settings → Environment Variables =====");
console.log("# (Key = text before '=', Value = text after '='. Apply to Production, Preview, Development.)\n");
console.log(lines.join("\n"));
console.log("\n# ✅ These match your seeded database, so demo@remitwise.app / demo1234 will work in the cloud.\n");

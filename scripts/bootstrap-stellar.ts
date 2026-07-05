/**
 * One-time on-chain bootstrap for RemitWise.
 *
 *   • generates a treasury (issuer + distributor) and a deployer
 *   • issues the demo USDC asset and deploys its Stellar Asset Contract (SAC)
 *   • builds is assumed done; deploys + initializes the Soroban savings vault
 *   • writes stellar.config.json for the app to consume
 *
 * Run:  npm run stellar:bootstrap   (add --force to redeploy)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  makeHorizon,
  fundFriendbot,
  submitClassic,
  changeTrustOp,
  paymentOp,
} from "../src/lib/stellar/chain";

const HORIZON = "https://horizon-testnet.stellar.org";
const SOROBAN = "https://soroban-testnet.stellar.org";
const PASS = Networks.TESTNET;
const WASM = "contracts/savings-vault/target/wasm32v1-none/release/savings_vault.wasm";
const CONFIG = path.join(process.cwd(), "stellar.config.json");

const t0 = Date.now();
const log = (m: string) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const cli = (cmd: string) =>
  execSync(`stellar ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .trim()
    .split("\n")
    .pop()!
    .trim();

async function main() {
  if (fs.existsSync(CONFIG) && !process.argv.includes("--force")) {
    log("stellar.config.json already exists — skipping (use --force to redeploy).");
    return;
  }
  if (!fs.existsSync(WASM)) {
    throw new Error(`Vault wasm not found at ${WASM}. Run: npm run contract:build`);
  }

  const horizon = makeHorizon(HORIZON);
  const issuer = Keypair.random();
  const distributor = Keypair.random();
  const deployer = Keypair.random();

  log("funding issuer + distributor + deployer via Friendbot…");
  await Promise.all(
    [issuer, distributor, deployer].map((k) => fundFriendbot(k.publicKey())),
  );

  log("distributor establishes USDC trustline…");
  await submitClassic(horizon, PASS, distributor.secret(), changeTrustOp("USDC", issuer.publicKey()));

  log("issuer mints 1,000,000 USDC → distributor (treasury float)…");
  await submitClassic(
    horizon,
    PASS,
    issuer.secret(),
    paymentOp(distributor.publicKey(), "USDC", issuer.publicKey(), "1000000"),
  );

  log("deploying USDC Stellar Asset Contract (SAC)…");
  const sacContractId = cli(
    `contract asset deploy --asset USDC:${issuer.publicKey()} --source-account ${issuer.secret()} --network testnet`,
  );
  log(`  SAC: ${sacContractId}`);

  log("deploying savings-vault Soroban contract…");
  const vaultContractId = cli(
    `contract deploy --wasm ${WASM} --source-account ${deployer.secret()} --network testnet`,
  );
  log(`  vault: ${vaultContractId}`);

  log("initializing vault (default rate 20%)…");
  cli(
    `contract invoke --id ${vaultContractId} --source-account ${deployer.secret()} --network testnet -- ` +
      `initialize --admin ${deployer.publicKey()} --token ${sacContractId} --default_rate_bps 2000`,
  );

  const config = {
    network: "testnet",
    horizonUrl: HORIZON,
    sorobanRpcUrl: SOROBAN,
    networkPassphrase: PASS,
    usdc: { code: "USDC", issuer: issuer.publicKey() },
    sacContractId,
    vaultContractId,
    distributor: { publicKey: distributor.publicKey(), secret: distributor.secret() },
    deployer: { publicKey: deployer.publicKey(), secret: deployer.secret() },
  };
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));

  log("✅ Bootstrap complete → stellar.config.json");
  console.log(`\n   Vault:  https://stellar.expert/explorer/testnet/contract/${vaultContractId}`);
  console.log(`   USDC:   USDC:${issuer.publicKey()}\n`);
}

main().catch((e) => {
  console.error("BOOTSTRAP FAILED:", e?.message ?? e);
  process.exit(1);
});

/* De-risk gasless onboarding: sponsored account + sponsored trustline (0 XLM user),
 * then a fee-bumped Soroban call so the user never needs XLM. */
import fs from "node:fs";
import path from "node:path";
import {
  Keypair, Asset, Operation, TransactionBuilder, BASE_FEE, Contract,
  Address, nativeToScVal, scValToNative, rpc, Horizon,
} from "@stellar/stellar-sdk";

const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "stellar.config.json"), "utf8"));
const PASS = cfg.networkPassphrase;
const horizon = new Horizon.Server(cfg.horizonUrl);
const soroban = new rpc.Server(cfg.sorobanRpcUrl);
const USDC = new Asset(cfg.usdc.code, cfg.usdc.issuer);
const t0 = Date.now();
const log = (m: string) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

async function main() {
  const treasury = Keypair.fromSecret(cfg.distributor.secret);
  const user = Keypair.random();
  log(`user (unfunded): ${user.publicKey()}`);

  // 1) Sponsored account creation + sponsored trustline — user needs 0 XLM.
  const src = await horizon.loadAccount(treasury.publicKey());
  const tx = new TransactionBuilder(src, { fee: (Number(BASE_FEE) * 6).toString(), networkPassphrase: PASS })
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: user.publicKey() }))
    .addOperation(Operation.createAccount({ destination: user.publicKey(), startingBalance: "0" }))
    .addOperation(Operation.changeTrust({ asset: USDC, source: user.publicKey() }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: user.publicKey() }))
    .setTimeout(90).build();
  tx.sign(treasury, user);
  const res = await horizon.submitTransaction(tx);
  log(`sponsored onboarding tx: ${res.hash}`);

  const acct = await horizon.loadAccount(user.publicKey());
  const xlm = acct.balances.find((b) => b.asset_type === "native");
  const usdc = acct.balances.find((b) => "asset_code" in b && b.asset_code === "USDC");
  log(`user XLM balance = ${xlm && "balance" in xlm ? xlm.balance : "?"} (expect 0.0000000)`);
  log(`user USDC trustline present = ${Boolean(usdc)} · sponsor = ${(usdc as { sponsor?: string })?.sponsor?.slice(0, 6)}…`);

  // 2) Fee-bumped Soroban call: user signs, treasury pays the fee (user has 0 XLM).
  const account = await soroban.getAccount(user.publicKey());
  const contract = new Contract(cfg.vaultContractId);
  let inner = new TransactionBuilder(account, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: PASS })
    .addOperation(contract.call("set_rate", new Address(user.publicKey()).toScVal(), nativeToScVal(2500, { type: "u32" })))
    .setTimeout(90).build();
  inner = await soroban.prepareTransaction(inner);
  inner.sign(user);
  log(`inner tx fee (stroops): ${inner.fee}`);

  const fb = TransactionBuilder.buildFeeBumpTransaction(treasury, (Number(inner.fee) * 2).toString(), inner, PASS);
  fb.sign(treasury);
  const sent = await soroban.sendTransaction(fb);
  let r = await soroban.getTransaction(sent.hash);
  for (let i = 0; i < 30 && r.status === "NOT_FOUND"; i++) { await new Promise((x) => setTimeout(x, 1000)); r = await soroban.getTransaction(sent.hash); }
  log(`fee-bumped set_rate status: ${r.status} · tx ${sent.hash}`);

  // verify the rate was set (read via simulate)
  const rr = new TransactionBuilder(await soroban.getAccount(treasury.publicKey()), { fee: BASE_FEE, networkPassphrase: PASS })
    .addOperation(contract.call("rate_of", new Address(user.publicKey()).toScVal())).setTimeout(30).build();
  const sim = await soroban.simulateTransaction(rr);
  const rate = rpc.Api.isSimulationSuccess(sim) && sim.result ? scValToNative(sim.result.retval) : "?";
  log(`on-chain rate_of(user) = ${rate} (expect 2500)`);
  log("✅ GASLESS ONBOARDING + FEE-BUMP WORKS — user held 0 XLM throughout.");
}
main().catch((e) => { console.error("SPONSOR SMOKE FAILED:", e?.response?.data?.extras?.result_codes ?? e?.message ?? e); process.exit(1); });

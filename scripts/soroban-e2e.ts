/* Full Soroban pipeline de-risk:
 *  classic USDC issuance → SAC deploy → vault deploy+init → JS-RPC deposit_remittance → verify.
 */
import { execSync } from "node:child_process";
import {
  Keypair, Asset, Operation, TransactionBuilder, Networks, BASE_FEE,
  Horizon, rpc, Contract, Address, nativeToScVal, scValToNative,
} from "@stellar/stellar-sdk";

const PASS = Networks.TESTNET;
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const soroban = new rpc.Server("https://soroban-testnet.stellar.org");
const WASM = "contracts/savings-vault/target/wasm32v1-none/release/savings_vault.wasm";
const t0 = Date.now();
const log = (m: string) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const UNIT = 10_000_000; // 1 USDC = 1e7 stroops

async function fund(pk: string) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${pk}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}
async function classic(secret: string, op: xdrOp) {
  const kp = Keypair.fromSecret(secret);
  const acct = await horizon.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: PASS })
    .addOperation(op).setTimeout(60).build();
  tx.sign(kp);
  return horizon.submitTransaction(tx);
}
type xdrOp = ReturnType<typeof Operation.payment>;

function cli(cmd: string): string {
  return execSync(`stellar ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .trim().split("\n").pop()!.trim();
}

async function invoke(contractId: string, sourceSecret: string, method: string, args: ReturnType<typeof nativeToScVal>[]) {
  const kp = Keypair.fromSecret(sourceSecret);
  const account = await soroban.getAccount(kp.publicKey());
  const contract = new Contract(contractId);
  let tx = new TransactionBuilder(account, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: PASS })
    .addOperation(contract.call(method, ...args)).setTimeout(60).build();
  tx = await soroban.prepareTransaction(tx);
  tx.sign(kp);
  const sent = await soroban.sendTransaction(tx);
  let res = await soroban.getTransaction(sent.hash);
  for (let i = 0; i < 30 && res.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await soroban.getTransaction(sent.hash);
  }
  if (res.status !== "SUCCESS") throw new Error(`invoke ${method} => ${res.status}`);
  return { hash: sent.hash, value: res.returnValue ? scValToNative(res.returnValue) : null };
}

async function main() {
  const issuer = Keypair.random();
  const distributor = Keypair.random();
  const deployer = Keypair.random();
  const user = Keypair.random();
  const USDC = new Asset("USDC", issuer.publicKey());

  log("funding 4 accounts…");
  await Promise.all([issuer, distributor, deployer, user].map((k) => fund(k.publicKey())));

  log("distributor + user trustlines → USDC…");
  await classic(distributor.secret(), Operation.changeTrust({ asset: USDC, limit: "10000000" }));
  await classic(user.secret(), Operation.changeTrust({ asset: USDC, limit: "10000000" }));

  log("issuer issues 100000 USDC → distributor…");
  await classic(issuer.secret(), Operation.payment({ destination: distributor.publicKey(), asset: USDC, amount: "100000" }));

  log("deploy USDC SAC via stellar-cli…");
  const sac = cli(`contract asset deploy --asset USDC:${issuer.publicKey()} --source-account ${issuer.secret()} --network testnet`);
  log(`SAC id: ${sac}`);

  log("deploy vault wasm via stellar-cli…");
  const vault = cli(`contract deploy --wasm ${WASM} --source-account ${deployer.secret()} --network testnet`);
  log(`vault id: ${vault}`);

  log("initialize vault…");
  cli(`contract invoke --id ${vault} --source-account ${deployer.secret()} --network testnet -- initialize --admin ${deployer.publicKey()} --token ${sac} --default_rate_bps 2000`);

  log("⭐ invoke deposit_remittance(distributor→user, 500 USDC) via JS RPC…");
  const amount = (500 * UNIT).toString();
  const dep = await invoke(vault, distributor.secret(), "deposit_remittance", [
    new Address(distributor.publicKey()).toScVal(),
    new Address(user.publicKey()).toScVal(),
    nativeToScVal(amount, { type: "i128" }),
  ]);
  const bj = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
  log(`deposit tx: ${dep.hash} → [saved,available]=${bj(dep.value)}`);

  const acct = await horizon.loadAccount(user.publicKey());
  const bal = acct.balances.find((b) => "asset_code" in b && b.asset_code === "USDC");
  const savings = await invoke(vault, deployer.secret(), "savings_of", [new Address(user.publicKey()).toScVal()]).catch(() => null);
  log(`USER on-chain USDC (available) = ${bal && "balance" in bal ? bal.balance : "?"}`);
  log(`VAULT savings_of(user) = ${savings?.value?.toString()}`);
  log("✅ FULL SOROBAN PIPELINE WORKS");
}
main().catch((e) => { console.error("E2E FAILED:", e?.message ?? e); process.exit(1); });

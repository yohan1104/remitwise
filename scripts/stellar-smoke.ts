/* Stellar testnet smoke test — de-risks the real on-chain flow.
 * Issues a custom USDC asset, sets trustlines, and moves it between accounts. */
import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Horizon,
} from "@stellar/stellar-sdk";

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const t0 = Date.now();
const log = (m: string) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

async function fund(pk: string) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${pk}`);
  if (!res.ok) throw new Error(`friendbot ${res.status}`);
}

async function submit(sourceSecret: string, build: (b: TransactionBuilder) => void) {
  const kp = Keypair.fromSecret(sourceSecret);
  const acct = await server.loadAccount(kp.publicKey());
  const builder = new TransactionBuilder(acct, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });
  build(builder);
  const tx = builder.setTimeout(60).build();
  tx.sign(kp);
  return server.submitTransaction(tx);
}

async function main() {
  const issuer = Keypair.random();
  const distributor = Keypair.random();
  const user = Keypair.random();
  const USDC = new Asset("USDC", issuer.publicKey());

  log("funding issuer + distributor + user via friendbot…");
  await Promise.all([fund(issuer.publicKey()), fund(distributor.publicKey()), fund(user.publicKey())]);
  log("funded.");

  log("distributor trustline → USDC…");
  await submit(distributor.secret(), (b) =>
    b.addOperation(Operation.changeTrust({ asset: USDC, limit: "1000000" })),
  );

  log("issuer issues 100000 USDC → distributor…");
  await submit(issuer.secret(), (b) =>
    b.addOperation(Operation.payment({ destination: distributor.publicKey(), asset: USDC, amount: "100000" })),
  );

  log("user trustline → USDC…");
  await submit(user.secret(), (b) =>
    b.addOperation(Operation.changeTrust({ asset: USDC, limit: "1000000" })),
  );

  log("distributor pays 500 USDC → user (a 'remittance')…");
  const remit = await submit(distributor.secret(), (b) =>
    b.addOperation(Operation.payment({ destination: user.publicKey(), asset: USDC, amount: "500" })),
  );
  log(`remittance tx hash: ${remit.hash}`);

  const acct = await server.loadAccount(user.publicKey());
  const bal = acct.balances.find((x) => "asset_code" in x && x.asset_code === "USDC");
  log(`USER USDC BALANCE = ${bal && "balance" in bal ? bal.balance : "?"}`);
  log("✅ full asset issuance + payment flow works on testnet.");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e?.response?.data?.extras?.result_codes ?? e.message ?? e);
  process.exit(1);
});

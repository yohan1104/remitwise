/* De-risk: read PHP/USD from the Reflector FX oracle on testnet. */
import { rpc, TransactionBuilder, BASE_FEE, Contract, Keypair, xdr, scValToNative, Networks } from "@stellar/stellar-sdk";
import fs from "node:fs";

const cfg = JSON.parse(fs.readFileSync("stellar.config.json", "utf8"));
const soroban = new rpc.Server(cfg.sorobanRpcUrl);
const ORACLE = "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W"; // Reflector Fiat FX (testnet)

async function read(method: string, args: xdr.ScVal[] = []) {
  const source = Keypair.fromSecret(cfg.distributor.secret);
  const account = await soroban.getAccount(source.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(ORACLE).call(method, ...args))
    .setTimeout(30).build();
  const sim = await soroban.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${method}: ${sim.error}`);
  return sim.result?.retval ? scValToNative(sim.result.retval) : null;
}

const fiat = (code: string) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol(code)]);

async function main() {
  const decimals = await read("decimals");
  console.log("decimals:", decimals);
  const assets = await read("assets");
  console.log("assets:", JSON.stringify(assets, (_, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 400));
  for (const code of ["PHP", "EUR"]) {
    try {
      const p = await read("lastprice", [fiat(code)]);
      if (p) {
        const price = Number(p.price) / 10 ** Number(decimals);
        console.log(`${code}: price=${price} (raw ${p.price}) ts=${p.timestamp} → 1 USD ≈ ${(1 / price).toFixed(2)} ${code}`);
      } else console.log(`${code}: null (not in feed)`);
    } catch (e) { console.log(`${code}: ERR ${(e as Error).message.slice(0, 120)}`); }
  }
}
main().catch((e) => { console.error("ORACLE SMOKE FAILED:", e.message); process.exit(1); });

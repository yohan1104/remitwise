/**
 * Low-level Stellar/Soroban helpers — pure and config-free so they can be used
 * by both the app runtime and the one-time bootstrap script.
 */
import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Horizon,
  rpc,
  Contract,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

export const USDC_DECIMALS = 7;
const UNIT = 10 ** USDC_DECIMALS;

/** Convert a human USDC amount to contract stroops (i128 string). */
export function usdcToStroops(amount: number): string {
  return BigInt(Math.round(amount * UNIT)).toString();
}
/** Convert contract stroops back to a human USDC number. */
export function stroopsToUsdc(stroops: bigint | string | number): number {
  return Number(BigInt(stroops)) / UNIT;
}

export function makeHorizon(url: string) {
  return new Horizon.Server(url);
}
export function makeSoroban(url: string) {
  return new rpc.Server(url, { allowHttp: url.startsWith("http://") });
}

export async function fundFriendbot(publicKey: string): Promise<boolean> {
  try {
    const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`, {
      signal: AbortSignal.timeout(20000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function submitClassic(
  horizon: Horizon.Server,
  passphrase: string,
  sourceSecret: string,
  op: xdr.Operation,
) {
  const kp = Keypair.fromSecret(sourceSecret);
  const account = await horizon.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(op)
    .setTimeout(60)
    .build();
  tx.sign(kp);
  return horizon.submitTransaction(tx);
}

export function changeTrustOp(code: string, issuer: string, limit = "1000000000") {
  return Operation.changeTrust({ asset: new Asset(code, issuer), limit });
}
export function paymentOp(destination: string, code: string, issuer: string, amount: string) {
  return Operation.payment({ destination, asset: new Asset(code, issuer), amount });
}

/** Read a classic USDC trustline balance (string), or null if no trustline. */
export async function getUsdcBalance(
  horizon: Horizon.Server,
  publicKey: string,
  code: string,
  issuer: string,
): Promise<{ funded: boolean; hasTrustline: boolean; balance: string | null; xlm: string | null }> {
  try {
    const acct = await horizon.loadAccount(publicKey);
    const usdc = acct.balances.find(
      (b) => "asset_code" in b && b.asset_code === code && b.asset_issuer === issuer,
    );
    const xlm = acct.balances.find((b) => b.asset_type === "native");
    return {
      funded: true,
      hasTrustline: Boolean(usdc),
      balance: usdc && "balance" in usdc ? usdc.balance : null,
      xlm: xlm && "balance" in xlm ? xlm.balance : null,
    };
  } catch {
    return { funded: false, hasTrustline: false, balance: null, xlm: null };
  }
}

export const addressArg = (publicKey: string) => new Address(publicKey).toScVal();
export const i128Arg = (stroops: string) => nativeToScVal(stroops, { type: "i128" });

export interface InvokeResult {
  hash: string;
  returnValue: unknown;
}

/**
 * Invoke a Soroban contract method. `sourceSecret` signs and sources the tx —
 * so when a method calls `x.require_auth()` and x is the source, the tx
 * signature satisfies it (no separate auth-entry signing needed).
 */
export async function invokeContract(opts: {
  soroban: rpc.Server;
  passphrase: string;
  contractId: string;
  sourceSecret: string;
  method: string;
  args?: xdr.ScVal[];
  timeoutMs?: number;
}): Promise<InvokeResult> {
  const { soroban, passphrase, contractId, sourceSecret, method, args = [] } = opts;
  const kp = Keypair.fromSecret(sourceSecret);
  const account = await soroban.getAccount(kp.publicKey());
  const contract = new Contract(contractId);

  let tx = new TransactionBuilder(account, {
    fee: (Number(BASE_FEE) * 1000).toString(),
    networkPassphrase: passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(90)
    .build();

  tx = await soroban.prepareTransaction(tx);
  tx.sign(kp);

  const sent = await soroban.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(`Soroban send failed: ${JSON.stringify(sent.errorResult)}`);
  }

  const deadline = Date.now() + (opts.timeoutMs ?? 40000);
  let res = await soroban.getTransaction(sent.hash);
  while (res.status === "NOT_FOUND" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await soroban.getTransaction(sent.hash);
  }
  if (res.status !== "SUCCESS") {
    throw new Error(`Soroban tx ${sent.hash} status: ${res.status}`);
  }
  return {
    hash: sent.hash,
    returnValue: res.returnValue ? scValToNative(res.returnValue) : null,
  };
}

/** Read-only contract call via simulation (no fee, no state change). */
export async function simulateRead(opts: {
  soroban: rpc.Server;
  passphrase: string;
  contractId: string;
  sourceSecret: string;
  method: string;
  args?: xdr.ScVal[];
}): Promise<unknown> {
  const { soroban, passphrase, contractId, sourceSecret, method, args = [] } = opts;
  const kp = Keypair.fromSecret(sourceSecret);
  const account = await soroban.getAccount(kp.publicKey());
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await soroban.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return sim.result?.retval ? scValToNative(sim.result.retval) : null;
}

/**
 * Low-level Stellar/Soroban helpers — pure and config-free so they can be used
 * by both the app runtime and the one-time bootstrap script.
 */
import {
  Keypair,
  Asset,
  Memo,
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

/**
 * Gasless onboarding: the treasury sponsors the user's base reserve and USDC
 * trustline reserve, so the user account is created and can hold USDC with
 * ZERO XLM. Underbanked users never need to acquire crypto. Idempotent.
 */
export async function sponsoredProvision(opts: {
  horizon: Horizon.Server;
  passphrase: string;
  treasurySecret: string;
  userSecret: string;
  code: string;
  issuer: string;
}): Promise<{ funded: boolean; trustline: boolean; hash?: string }> {
  const { horizon, passphrase, treasurySecret, userSecret, code, issuer } = opts;
  const treasury = Keypair.fromSecret(treasurySecret);
  const user = Keypair.fromSecret(userSecret);

  let exists = false;
  let hasTrust = false;
  try {
    const a = await horizon.loadAccount(user.publicKey());
    exists = true;
    hasTrust = a.balances.some(
      (b) => "asset_code" in b && b.asset_code === code && b.asset_issuer === issuer,
    );
  } catch {
    /* account not yet created */
  }
  if (exists && hasTrust) return { funded: true, trustline: true };

  const src = await horizon.loadAccount(treasury.publicKey());
  const b = new TransactionBuilder(src, {
    fee: (Number(BASE_FEE) * 8).toString(),
    networkPassphrase: passphrase,
  });
  b.addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: user.publicKey() }));
  if (!exists) {
    b.addOperation(Operation.createAccount({ destination: user.publicKey(), startingBalance: "0" }));
  }
  if (!hasTrust) {
    b.addOperation(Operation.changeTrust({ asset: new Asset(code, issuer), source: user.publicKey() }));
  }
  b.addOperation(Operation.endSponsoringFutureReserves({ source: user.publicKey() }));

  const tx = b.setTimeout(90).build();
  tx.sign(treasury, user);
  const res = await horizon.submitTransaction(tx);
  return { funded: true, trustline: true, hash: res.hash };
}

/**
 * Submit a classic payment from a zero-XLM user account: the user signs the
 * payment, the treasury wraps it in a fee-bump and pays the network fee.
 * Used for off-ramp settlement (user's USDC → anchor's Stellar account).
 */
export async function submitPaymentFeeBump(opts: {
  horizon: Horizon.Server;
  passphrase: string;
  sourceSecret: string;
  feeSourceSecret: string;
  destination: string;
  code: string;
  issuer: string;
  /** Decimal USDC amount as a string with ≤7 dp, e.g. "25.5000000". */
  amount: string;
  memoText?: string;
}): Promise<{ hash: string }> {
  const { horizon, passphrase } = opts;
  const source = Keypair.fromSecret(opts.sourceSecret);
  const feeSource = Keypair.fromSecret(opts.feeSourceSecret);

  const account = await horizon.loadAccount(source.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  }).addOperation(
    Operation.payment({
      destination: opts.destination,
      asset: new Asset(opts.code, opts.issuer),
      amount: opts.amount,
    }),
  );
  if (opts.memoText) builder.addMemo(Memo.text(opts.memoText.slice(0, 28)));
  const inner = builder.setTimeout(90).build();
  inner.sign(source);

  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    feeSource,
    (Number(BASE_FEE) * 10).toString(),
    inner,
    passphrase,
  );
  feeBump.sign(feeSource);
  const res = await horizon.submitTransaction(feeBump);
  return { hash: res.hash };
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
  /** When set, this account pays the transaction fee (fee-bump), so the
   *  source account can operate with zero XLM — "gasless" for the user. */
  feeBumpSecret?: string;
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

  // Optionally wrap in a fee-bump so the treasury pays the network fee.
  let submitTx: typeof tx | ReturnType<typeof TransactionBuilder.buildFeeBumpTransaction> = tx;
  if (opts.feeBumpSecret) {
    const feeSource = Keypair.fromSecret(opts.feeBumpSecret);
    const fb = TransactionBuilder.buildFeeBumpTransaction(
      feeSource,
      (Number(tx.fee) * 2).toString(),
      tx,
      passphrase,
    );
    fb.sign(feeSource);
    submitTx = fb;
  }

  const sent = await soroban.sendTransaction(submitTx);
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

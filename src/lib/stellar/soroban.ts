import "server-only";
import { getStellarConfig } from "./config";
import {
  makeHorizon,
  makeSoroban,
  fundFriendbot,
  submitClassic,
  changeTrustOp,
  getUsdcBalance,
  invokeContract,
  simulateRead,
  addressArg,
  i128Arg,
  usdcToStroops,
  stroopsToUsdc,
} from "./chain";

function ctx() {
  const cfg = getStellarConfig();
  return {
    cfg,
    horizon: makeHorizon(cfg.horizonUrl),
    soroban: makeSoroban(cfg.sorobanRpcUrl),
    pass: cfg.networkPassphrase,
  };
}

export interface WalletState {
  funded: boolean;
  hasTrustline: boolean;
  availableUsdc: number;
  xlm: number;
}

/** Read the user's on-chain state: funded, trustline, spendable USDC, XLM. */
export async function getWalletState(publicKey: string): Promise<WalletState> {
  const { cfg, horizon } = ctx();
  const b = await getUsdcBalance(horizon, publicKey, cfg.usdc.code, cfg.usdc.issuer);
  return {
    funded: b.funded,
    hasTrustline: b.hasTrustline,
    availableUsdc: b.balance ? Number(b.balance) : 0,
    xlm: b.xlm ? Number(b.xlm) : 0,
  };
}

/** Fund a new wallet via Friendbot and establish its USDC trustline. */
export async function provisionWallet(secret: string): Promise<{ funded: boolean; trustline: boolean }> {
  const { cfg, horizon, pass } = ctx();
  const { Keypair } = await import("@stellar/stellar-sdk");
  const publicKey = Keypair.fromSecret(secret).publicKey();

  const state = await getWalletState(publicKey);
  const funded = state.funded || (await fundFriendbot(publicKey));
  if (!funded) return { funded: false, trustline: false };

  if (state.hasTrustline) return { funded: true, trustline: true };
  try {
    await submitClassic(horizon, pass, secret, changeTrustOp(cfg.usdc.code, cfg.usdc.issuer));
    return { funded: true, trustline: true };
  } catch {
    return { funded: true, trustline: false };
  }
}

export interface DepositResult {
  hash: string;
  saved: number;
  available: number;
}

/**
 * ⭐ Run a remittance through the on-chain vault: the treasury sends `amount`
 * USDC, the contract retains the savings share and releases the rest to the
 * user — atomically, enforced on-chain. Returns the real tx hash + split.
 */
export async function depositRemittance(
  userPublicKey: string,
  amountUsdc: number,
): Promise<DepositResult> {
  const { cfg, soroban, pass } = ctx();
  const res = await invokeContract({
    soroban,
    passphrase: pass,
    contractId: cfg.vaultContractId,
    sourceSecret: cfg.distributor.secret,
    method: "deposit_remittance",
    args: [addressArg(cfg.distributor.publicKey), addressArg(userPublicKey), i128Arg(usdcToStroops(amountUsdc))],
  });
  const [saved, available] = res.returnValue as [bigint, bigint];
  return { hash: res.hash, saved: stroopsToUsdc(saved), available: stroopsToUsdc(available) };
}

/** Move spendable USDC from the user into their on-chain savings (100%). */
export async function depositSavings(
  userSecret: string,
  userPublicKey: string,
  amountUsdc: number,
): Promise<{ hash: string }> {
  const { cfg, soroban, pass } = ctx();
  const res = await invokeContract({
    soroban,
    passphrase: pass,
    contractId: cfg.vaultContractId,
    sourceSecret: userSecret,
    method: "deposit_savings",
    args: [addressArg(userPublicKey), addressArg(userPublicKey), i128Arg(usdcToStroops(amountUsdc))],
  });
  return { hash: res.hash };
}

/** Withdraw savings from the vault back to the user (user-authorized). */
export async function withdrawSavings(
  userSecret: string,
  userPublicKey: string,
  amountUsdc: number,
): Promise<{ hash: string }> {
  const { cfg, soroban, pass } = ctx();
  const res = await invokeContract({
    soroban,
    passphrase: pass,
    contractId: cfg.vaultContractId,
    sourceSecret: userSecret,
    method: "withdraw",
    args: [addressArg(userPublicKey), i128Arg(usdcToStroops(amountUsdc))],
  });
  return { hash: res.hash };
}

/** Set the user's on-chain auto-save rate (basis points), user-authorized. */
export async function setUserRate(userSecret: string, rateBps: number): Promise<{ hash: string }> {
  const { cfg, soroban, pass } = ctx();
  const { Keypair, nativeToScVal } = await import("@stellar/stellar-sdk");
  const publicKey = Keypair.fromSecret(userSecret).publicKey();
  const res = await invokeContract({
    soroban,
    passphrase: pass,
    contractId: cfg.vaultContractId,
    sourceSecret: userSecret,
    method: "set_rate",
    args: [addressArg(publicKey), nativeToScVal(rateBps, { type: "u32" })],
  });
  return { hash: res.hash };
}

/** Read the user's on-chain savings balance held by the vault. */
export async function getOnChainSavings(userPublicKey: string): Promise<number> {
  const { cfg, soroban, pass } = ctx();
  const val = await simulateRead({
    soroban,
    passphrase: pass,
    contractId: cfg.vaultContractId,
    sourceSecret: cfg.distributor.secret,
    method: "savings_of",
    args: [addressArg(userPublicKey)],
  });
  return stroopsToUsdc((val as bigint) ?? 0n);
}

// ---- Explorer links --------------------------------------------------------
export function explorer() {
  const net = getStellarConfig().network;
  const base = `https://stellar.expert/explorer/${net}`;
  return {
    tx: (hash: string) => `${base}/tx/${hash}`,
    account: (pk: string) => `${base}/account/${pk}`,
    contract: (id: string) => `${base}/contract/${id}`,
  };
}

export function vaultInfo() {
  const cfg = getStellarConfig();
  return {
    vaultContractId: cfg.vaultContractId,
    usdcIssuer: cfg.usdc.issuer,
    network: cfg.network,
  };
}
